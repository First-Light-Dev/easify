import axios, { AxiosInstance } from 'axios';

import {
  ShipHeroAuthError,
  ShipHeroError,
  ShipHeroGraphQLError,
  ShipHeroThrottleError,
  THROTTLE_ERROR_CODE,
  parseTimeRemaining
} from './errors';

/** GraphQL endpoint for the ShipHero public API. */
export const SHIPHERO_GRAPHQL_URL = 'https://public-api.shiphero.com/graphql';
/** Token and refresh endpoints live under this root. */
export const SHIPHERO_AUTH_URL = 'https://public-api.shiphero.com/auth';

/** Credits an account starts with; no single operation may exceed this. */
export const SHIPHERO_MAX_CREDITS = 4004;
/** Credits restored per second. */
export const SHIPHERO_CREDIT_RESTORE_RATE = 60;
/** ShipHero counts requests over a rolling five minute window. */
export const SHIPHERO_REQUEST_WINDOW_MS = 5 * 60 * 1000;
/** Hard request ceiling per window, including failed and introspection requests. */
export const SHIPHERO_MAX_REQUESTS_PER_WINDOW = 7000;

export interface ShipHeroAuth {
  /**
   * Bearer token for the GraphQL endpoint. Expires 28 days after issue, so supply
   * a `refreshToken` as well unless the token is refreshed out of band.
   */
  accessToken?: string;
  /** Long-lived token used to mint new access tokens. Static while the user is active. */
  refreshToken?: string;
  /** Falls back to a username/password grant when no token is available. */
  username?: string;
  password?: string;
}

export interface ShipHeroOptions {
  /** Overrides the GraphQL endpoint, mainly for testing. */
  graphqlURL?: string;
  /** Overrides the auth endpoint root, mainly for testing. */
  authURL?: string;
  /**
   * Default `customer_account_id` for 3PL users. Applied to operations that accept
   * it when the caller does not pass one.
   */
  customerAccountId?: string;
  /** Logs each request, response and error to the console. Defaults to false. */
  log?: boolean;
  /** Retries for credit throttling, 429s and 5xx. Defaults to 5, capped at 10. */
  maxRetries?: number;
  /** Longest a throttled request will wait before giving up. Defaults to 60s. */
  maxThrottleWaitMs?: number;
  /**
   * Requests this client will make in any five minute window. Defaults to 6500,
   * leaving headroom under ShipHero's 7000 ceiling for other clients on the account.
   */
  maxRequestsPerWindow?: number;
  /** Account credit ceiling, if it differs from the 4004 default. */
  maxCredits?: number;
  /** Invoked whenever a new access token is issued, so callers can persist it. */
  onAccessToken?: (token: {
    accessToken: string;
    expiresIn: number;
    expiresAt: Date;
  }) => void | Promise<void>;
}

export interface ShipHeroConfig {
  auth: ShipHeroAuth;
  options?: ShipHeroOptions;
}

export interface RequestOptions {
  /** Name used in error messages when the document does not carry one. */
  operationName?: string;
  signal?: AbortSignal;
}

/**
 * Structural stand-in for `TypedDocumentNode` from `@graphql-typed-document-node/core`.
 * Declared locally so this package needs no `graphql` dependency; documents produced by
 * graphql-codegen satisfy it and carry their result and variable types with them.
 */
export interface TypedDocument<TData = unknown, TVariables = Record<string, unknown>> {
  kind: 'Document';
  definitions: readonly unknown[];
  loc?: { source?: { body: string } };
  __apiType?: (variables: TVariables) => TData;
}

/** Either a raw GraphQL string or a codegen-produced typed document. */
export type ShipHeroDocument<TData = unknown, TVariables = Record<string, unknown>> =
  | string
  | TypedDocument<TData, TVariables>;

/**
 * Serialises a document to the string the API expects. Parsed documents keep their
 * original text on `loc.source.body`; anything else falls back to `graphql`'s printer,
 * which is only required in the rare case a document was built by hand.
 */
function printDocument(document: ShipHeroDocument<unknown, unknown>): string {
  if (typeof document === 'string') return document;

  const body = document.loc?.source?.body;
  if (typeof body === 'string' && body.length) return body;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('graphql') as typeof import('graphql')).print(document as never);
  } catch {
    throw new ShipHeroError(
      'Cannot serialise GraphQL document: it carries no source text and `graphql` is not installed'
    );
  }
}

/** Cost metadata ShipHero returns alongside every operation. */
export interface RequestCost {
  requestId?: string;
  complexity?: number;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Transport for the ShipHero public GraphQL API. Handles bearer-token auth with
 * automatic refresh, ShipHero's credit-based throttling, and the rolling request
 * ceiling.
 *
 * The client deliberately owns no queries. Documents live in the calling project,
 * generated against `generated/schema.graphql` so they stay typed without this
 * package needing a release for every new operation.
 */
export class ShipHeroClient {
  readonly config: ShipHeroConfig;

  /** Cost of the most recent operation, useful when tuning page sizes. */
  lastCost: RequestCost = {};

  private readonly http: AxiosInstance;
  private readonly auth: AxiosInstance;
  private readonly maxRetries: number;
  private readonly maxThrottleWaitMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly maxCredits: number;

  private accessToken?: string;
  private accessTokenExpiresAt?: number;
  private refreshToken?: string;
  /** In-flight token request, so concurrent callers share one round trip. */
  private tokenRequest?: Promise<string>;

  /** Timestamps of recent requests, used to stay under the rolling ceiling. */
  private readonly requestTimes: number[] = [];

  constructor(config: ShipHeroConfig) {
    this.config = config;
    this.accessToken = config.auth.accessToken;
    this.refreshToken = config.auth.refreshToken;

    this.maxRetries = Math.min(config.options?.maxRetries ?? 5, 10);
    this.maxThrottleWaitMs = config.options?.maxThrottleWaitMs ?? 60_000;
    this.maxRequestsPerWindow = Math.min(
      config.options?.maxRequestsPerWindow ?? 6500,
      SHIPHERO_MAX_REQUESTS_PER_WINDOW
    );
    this.maxCredits = config.options?.maxCredits ?? SHIPHERO_MAX_CREDITS;

    this.http = axios.create({
      baseURL: config.options?.graphqlURL ?? SHIPHERO_GRAPHQL_URL,
      headers: { 'Content-Type': 'application/json' },
      // GraphQL errors arrive with a 200, and non-2xx bodies carry useful detail.
      validateStatus: () => true
    });

    this.auth = axios.create({
      baseURL: config.options?.authURL ?? SHIPHERO_AUTH_URL,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    });
  }

  /** Default `customer_account_id` for 3PL users, if configured. */
  get customerAccountId(): string | undefined {
    return this.config.options?.customerAccountId;
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /** Returns a usable access token, minting or refreshing one when needed. */
  async token(): Promise<string> {
    if (this.accessToken && !this.isTokenExpired()) return this.accessToken;
    return this.issueToken();
  }

  /**
   * Exchanges the refresh token (or username/password) for a new access token.
   * Concurrent callers share a single request.
   */
  async refresh(): Promise<string> {
    this.accessToken = undefined;
    this.accessTokenExpiresAt = undefined;
    return this.issueToken();
  }

  private isTokenExpired(): boolean {
    if (!this.accessTokenExpiresAt) return false;
    // Refresh an hour early so long-running jobs never trip over the boundary.
    return Date.now() >= this.accessTokenExpiresAt - 3_600_000;
  }

  private issueToken(): Promise<string> {
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestToken().finally(() => {
      this.tokenRequest = undefined;
    });
    return this.tokenRequest;
  }

  private async requestToken(): Promise<string> {
    const { username, password } = this.config.auth;

    let path: string;
    let payload: Record<string, string>;
    if (this.refreshToken) {
      path = '/refresh';
      payload = { refresh_token: this.refreshToken };
    } else if (username && password) {
      path = '/token';
      payload = { username, password };
    } else if (this.accessToken) {
      // Nothing to refresh with; keep using the supplied token until it is rejected.
      return this.accessToken;
    } else {
      throw new ShipHeroAuthError(
        'No ShipHero credentials: supply accessToken, refreshToken, or username and password'
      );
    }

    const response = await this.auth.post<TokenResponse>(path, payload);
    if (response.status < 200 || response.status >= 300 || !response.data?.access_token) {
      throw new ShipHeroAuthError(`ShipHero auth failed with status ${response.status}`, {
        status: response.status,
        body: response.data
      });
    }

    const { access_token, expires_in, refresh_token } = response.data;
    this.accessToken = access_token;
    this.accessTokenExpiresAt = expires_in ? Date.now() + expires_in * 1000 : undefined;
    if (refresh_token) this.refreshToken = refresh_token;

    if (this.config.options?.log) {
      console.log('ShipHero Auth', { path, expiresIn: expires_in ?? null });
    }

    await this.config.options?.onAccessToken?.({
      accessToken: access_token,
      expiresIn: expires_in ?? 0,
      expiresAt: new Date(this.accessTokenExpiresAt ?? Date.now())
    });

    return access_token;
  }

  // -------------------------------------------------------------------------
  // Request budget
  // -------------------------------------------------------------------------

  /**
   * Blocks until the rolling window has room. ShipHero returns 429s for more than
   * 7000 requests in five minutes, counting errors and introspection.
   */
  private async reserveRequestSlot(): Promise<void> {
    for (;;) {
      const cutoff = Date.now() - SHIPHERO_REQUEST_WINDOW_MS;
      while (this.requestTimes.length && this.requestTimes[0] <= cutoff) this.requestTimes.shift();

      if (this.requestTimes.length < this.maxRequestsPerWindow) {
        this.requestTimes.push(Date.now());
        return;
      }

      await sleep(this.requestTimes[0] + SHIPHERO_REQUEST_WINDOW_MS - Date.now() + 50);
    }
  }

  // -------------------------------------------------------------------------
  // GraphQL
  // -------------------------------------------------------------------------

  /**
   * Executes a GraphQL document and returns its `data`. Retries credit
   * exhaustion, 429s and 5xx responses, and refreshes an expired token once.
   *
   * A document generated by graphql-codegen carries its own result and variable
   * types, so nothing needs annotating:
   *
   * ```ts
   * const data = await client.request(PurchaseOrdersDocument, { from: since });
   * ```
   *
   * A raw string works too, with the result type supplied by the caller:
   *
   * ```ts
   * const data = await client.request<{ user_quota: { credits_remaining: number } }>(
   *   'query { user_quota { credits_remaining max_available increment_rate } }'
   * );
   * ```
   */
  request<TData, TVariables>(
    document: TypedDocument<TData, TVariables>,
    variables?: TVariables,
    options?: RequestOptions
  ): Promise<TData>;
  request<TData = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<TData>;
  async request<TData>(
    document: ShipHeroDocument<TData, unknown>,
    variables: unknown = {},
    options: RequestOptions = {}
  ): Promise<TData> {
    const text = printDocument(document);
    const operation =
      options.operationName ?? text.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
    let refreshed = false;

    for (let attempt = 0; ; attempt++) {
      await this.reserveRequestSlot();
      const token = await this.token();

      if (this.config.options?.log) {
        console.log('ShipHero Request', { operation, attempt, variables });
      }

      const response = await this.http.post(
        '',
        { query: text, variables: variables ?? {} },
        { headers: { Authorization: `Bearer ${token}` }, signal: options.signal }
      );

      const body = response.data as { data?: TData; errors?: ShipHeroGraphQLError[] } | undefined;

      if (this.config.options?.log) {
        console.log('ShipHero Response', {
          operation,
          status: response.status,
          errors: body?.errors?.length ?? 0
        });
      }

      // An expired or rotated token: refresh once, then fail for real.
      if (response.status === 401 || response.status === 403) {
        if (refreshed) {
          throw new ShipHeroAuthError(`ShipHero rejected the access token (${response.status})`, {
            status: response.status,
            body
          });
        }
        refreshed = true;
        await this.refresh();
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= this.maxRetries) {
          throw new ShipHeroError(
            `ShipHero ${operation} failed with status ${response.status} after ${
              attempt + 1
            } attempts`,
            { status: response.status, operation, body }
          );
        }
        const retryAfter = Number(response.headers?.['retry-after']);
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500
        );
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new ShipHeroError(`ShipHero ${operation} failed with status ${response.status}`, {
          status: response.status,
          operation,
          body
        });
      }

      if (body?.errors?.length) {
        const throttled = body.errors.find((error) => error.code === THROTTLE_ERROR_CODE);
        if (throttled) {
          const wait = this.throttleWaitMs(throttled);
          const fatal =
            wait === undefined ||
            wait > this.maxThrottleWaitMs ||
            (throttled.required_credits ?? 0) > this.maxCredits;

          if (fatal || attempt >= this.maxRetries) {
            throw new ShipHeroThrottleError(throttled.message, {
              errors: body.errors,
              operation: throttled.operation ?? operation,
              requestId: throttled.request_id,
              requiredCredits: throttled.required_credits,
              remainingCredits: throttled.remaining_credits,
              retryAfterMs: wait,
              body
            });
          }

          await sleep(wait + 250);
          continue;
        }

        const first = body.errors[0];
        throw new ShipHeroError(first?.message ?? `ShipHero ${operation} returned errors`, {
          errors: body.errors,
          operation: first?.operation ?? operation,
          requestId: first?.request_id,
          code: first?.code,
          body
        });
      }

      if (body?.data === undefined || body.data === null) {
        throw new ShipHeroError(`ShipHero ${operation} returned no data`, { operation, body });
      }

      this.lastCost = readCost(body.data);
      return body.data;
    }
  }

  /** Alias for {@link request}, for readability at call sites. */
  query<TData, TVariables>(
    document: TypedDocument<TData, TVariables>,
    variables?: TVariables,
    options?: RequestOptions
  ): Promise<TData>;
  query<TData = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<TData>;
  query<TData>(
    document: ShipHeroDocument<TData, unknown>,
    variables?: unknown,
    options?: RequestOptions
  ): Promise<TData> {
    return this.request<TData>(document as string, variables as Record<string, unknown>, options);
  }

  /** Alias for {@link request}, for readability at call sites. */
  mutate<TData, TVariables>(
    document: TypedDocument<TData, TVariables>,
    variables?: TVariables,
    options?: RequestOptions
  ): Promise<TData>;
  mutate<TData = unknown>(
    document: string,
    variables?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<TData>;
  mutate<TData>(
    document: ShipHeroDocument<TData, unknown>,
    variables?: unknown,
    options?: RequestOptions
  ): Promise<TData> {
    return this.request<TData>(document as string, variables as Record<string, unknown>, options);
  }

  /**
   * How long to wait before retrying a throttled operation. Prefers ShipHero's own
   * estimate and falls back to the documented 60 credits per second restore rate.
   */
  private throttleWaitMs(error: ShipHeroGraphQLError): number | undefined {
    const reported = parseTimeRemaining(error.time_remaining);
    if (reported !== undefined) return reported;

    const required = error.required_credits;
    const remaining = error.remaining_credits;
    if (required === undefined || remaining === undefined) return undefined;
    return Math.max(0, ((required - remaining) / SHIPHERO_CREDIT_RESTORE_RATE) * 1000);
  }
}

/** Pulls `request_id` and `complexity` out of whichever operation the response holds. */
function readCost(data: unknown): RequestCost {
  if (!data || typeof data !== 'object') return {};
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    if ('request_id' in record || 'complexity' in record) {
      return {
        requestId: typeof record.request_id === 'string' ? record.request_id : undefined,
        complexity: typeof record.complexity === 'number' ? record.complexity : undefined
      };
    }
  }
  return {};
}

export default ShipHeroClient;
