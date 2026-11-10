/**
 * Error classification for Finale Inventory.
 *
 * The only file that knows what shape a Finale failure arrives in. Everything above
 * it sees a `FinaleApiError` subclass carrying a `retryable` flag, which is the one
 * field callers branch on.
 *
 * Every error carries `retryable`, matching the other connectors in this package, so a
 * caller has one rule for deciding retry-or-fail across vendors,
 * and that only works if every connector reports failures the same way.
 *
 * Imports nothing — not axios. Foreign errors are duck-typed on axios's own
 * `isAxiosError` marker rather than `instanceof`, because `instanceof` silently
 * returns false when two copies of axios end up in the tree and a mis-detected error
 * would be classified UNKNOWN and never retried.
 */

export interface FinaleErrorContext {
  /** Connector method or endpoint, e.g. `createPurchaseOrder`. */
  operation?: string;
  /** The record involved — order id, variance id, SKU. */
  recordId?: string;
}

export interface FinaleApiErrorInput extends FinaleErrorContext {
  message: string;
  statusCode?: number;
  responseData?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

/** Base error, and the fallback for anything unrecognised. */
export class FinaleApiError extends Error {
  readonly statusCode: number;
  readonly responseData?: unknown;
  readonly retryable: boolean;
  readonly operation?: string;
  readonly recordId?: string;

  constructor(input: FinaleApiErrorInput) {
    super(input.message);
    // Assigned rather than passed to `super`: easify targets es2018, where the `cause`
    // constructor option does not exist. The property behaves identically at runtime on any
    // Node this ships to, and this keeps the whole package off an ES2022 target for one field.
    if (input.cause !== undefined) {
      (this as { cause?: unknown }).cause = input.cause;
    }
    this.name = 'FinaleApiError';
    this.statusCode = input.statusCode ?? 0;
    this.responseData = input.responseData;
    // Default false: retrying a mutation whose outcome is unknown risks duplicating
    // it, so retry is opt-in per class rather than assumed.
    this.retryable = input.retryable ?? false;
    this.operation = input.operation;
    this.recordId = input.recordId;
  }
}

/**
 * 401/403 — the API key or secret is wrong, or lacks permission.
 *
 * **Not retryable**, and this reversed during validation. An earlier version of this
 * package modelled Finale as session-authenticated, where a 401 means "re-authenticate"
 * and retrying is correct. The current Finale API uses a static Basic-auth key, so a 401
 * means the key is wrong and will still be wrong next attempt — retrying would just
 * hammer the endpoint with bad credentials.
 */
export class FinaleAuthError extends FinaleApiError {
  constructor(input: FinaleApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'FinaleAuthError';
  }
}

/**
 * Credentials are structurally wrong — a missing key, or the wrong account path.
 *
 * Kept distinct from `FinaleAuthError` (which Finale itself raised) because this one is
 * detected locally, before any request. Both are non-retryable.
 */
export class FinaleCredentialsError extends FinaleApiError {
  constructor(input: FinaleApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'FinaleCredentialsError';
  }
}

/** 4xx other than auth — the request is wrong. Never retried. */
export class FinaleClientError extends FinaleApiError {
  constructor(input: FinaleApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'FinaleClientError';
  }
}

/**
 * The SKU resolved to no Finale product.
 *
 * Distinct from every other failure here because it is the one an operator can actually fix,
 * and the fix is specific: create the product in Finale. Callers previously flattened *any*
 * `resolveUrl` failure into "SKU does not exist" — so an auth failure or a timeout told
 * someone to go create a product that was already there, while the real cause never surfaced.
 *
 * Not retryable: the product will still be absent next attempt.
 */
export class FinaleProductNotFoundError extends FinaleApiError {
  readonly sku: string;

  constructor(sku: string, input: Partial<FinaleApiErrorInput> = {}) {
    super({
      ...input,
      message:
        `SKU "${sku}" does not exist in Finale. It must be created there before stock can be ` +
        `sent against it.`,
      retryable: false,
    });
    this.name = 'FinaleProductNotFoundError';
    this.sku = sku;
  }
}

/**
 * 429 — over one of Finale's limits. Retryable.
 *
 * Finale publishes three separate budgets: 120 GET/min, 120 POST/min, and 300 collection
 * requests per hour. The hourly one is the trap — a poller can sit well inside the
 * per-minute limit and still exhaust it — so `resetAt` may be up to an hour away.
 */
export class FinaleRateLimitError extends FinaleApiError {
  /** Unix timestamp (seconds) when the window resets, from `X-RateLimit-Reset`. */
  readonly resetAt?: number;

  constructor(input: FinaleApiErrorInput & { resetAt?: number }) {
    super({ ...input, statusCode: input.statusCode ?? 429, retryable: true });
    this.name = 'FinaleRateLimitError';
    this.resetAt = input.resetAt;
  }
}

/** 5xx — Finale is unwell. Retryable. */
export class FinaleServerError extends FinaleApiError {
  constructor(input: FinaleApiErrorInput) {
    super({ ...input, retryable: true });
    this.name = 'FinaleServerError';
  }
}

/** No response — DNS, TLS, socket, timeout. Retryable. */
export class FinaleNetworkError extends FinaleApiError {
  readonly errorCode: string;

  constructor(input: FinaleApiErrorInput & { errorCode?: string }) {
    super({ ...input, statusCode: 0, retryable: true });
    this.name = 'FinaleNetworkError';
    this.errorCode = input.errorCode ?? 'UNKNOWN';
  }
}

/**
 * A 200 whose body was not what we expected.
 *
 * Its own class because Finale answers some failures with a 200 and an error body —
 * see `looksLikeFinaleFailure`. Treating that as success would let a "sync succeeded"
 * be recorded for an order that was never created.
 */
export class FinaleResponseError extends FinaleApiError {
  constructor(input: FinaleApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'FinaleResponseError';
  }
}

// ─── Foreign error detection ──────────────────────────────────────────────────

interface AxiosLike {
  isAxiosError: true;
  message: string;
  code?: string;
  response?: { status?: number; data?: unknown; headers?: unknown };
  config?: { url?: string; method?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAxiosLike(error: unknown): error is AxiosLike {
  return isRecord(error) && error.isAxiosError === true;
}

/**
 * Pulls something readable out of a Finale error body.
 *
 * Finale is inconsistent about error shape — sometimes a string, sometimes an
 * `errorMessage`, sometimes a list. Without this, messages degrade to
 * `Request failed with status code 400`, which says nothing about which product url
 * or facility Finale rejected.
 *
 * Several key names are checked because Finale is not consistent about which it uses.
 */
export function describeFinaleBody(data: unknown): string | undefined {
  if (typeof data === 'string') return data.trim().slice(0, 500) || undefined;
  if (!isRecord(data)) return undefined;

  const parts: string[] = [];
  for (const key of ['errorMessage', 'error', 'message', 'exception']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }
  for (const key of ['errors', 'errorMessageList', 'messages']) {
    const value = data[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) parts.push(entry.trim());
        else if (isRecord(entry) && typeof entry.message === 'string') parts.push(entry.message);
      }
    }
  }
  return parts.length ? parts.join('; ') : undefined;
}

/**
 * True when a 2xx body is actually reporting a failure.
 *
 * Finale can answer a create with 200 and an error payload. A connector that trusts
 * the status code alone would report success for an order that does not exist, and
 * the app would then wait forever for a receipt against it.
 *
 * Worth keeping accurate: a missed failure here is silent, and the caller waits forever for
 * a record that was never created.
 */
export function looksLikeFinaleFailure(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (data.success === false) return true;
  if (typeof data.errorMessage === 'string' && data.errorMessage.trim()) return true;
  if (Array.isArray(data.errors) && data.errors.length > 0) return true;
  return false;
}

/**
 * Reads Finale's rate-limit headers.
 *
 * Verified: Finale sends `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
 * `X-RateLimit-Reset`. Two things differ from ShipStation and are easy to conflate:
 * the hyphenation (`X-RateLimit-*` here, `X-Rate-Limit-*` there), and `Reset` being a
 * **Unix timestamp** rather than seconds-until-reset.
 */
export function readQuota(headers: unknown): {
  limit?: number;
  remaining?: number;
  resetAt?: number;
} {
  if (!isRecord(headers)) return {};
  const num = (key: string): number | undefined => {
    const raw = headers[key] ?? headers[key.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    limit: num('X-RateLimit-Limit'),
    remaining: num('X-RateLimit-Remaining'),
    resetAt: num('X-RateLimit-Reset'),
  };
}

function where(context: FinaleErrorContext, fallback?: string): string {
  const parts = [
    context.operation ?? fallback,
    context.recordId ? `(${context.recordId})` : undefined,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' ')}: ` : '';
}

// ─── Translation ──────────────────────────────────────────────────────────────

/**
 * Maps anything thrown beneath this package into the hierarchy above.
 *
 * Idempotent: an already-translated error is returned unchanged, so nesting guards
 * cannot re-wrap or lose the original classification.
 */
export function translateFinaleError(
  error: unknown,
  context: FinaleErrorContext = {}
): FinaleApiError {
  if (error instanceof FinaleApiError) return error;

  if (isAxiosLike(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const endpoint = error.config
      ? `${error.config.method?.toUpperCase() ?? 'REQUEST'} ${error.config.url ?? ''}`.trim()
      : undefined;
    const prefix = where(context, endpoint);
    const detail = describeFinaleBody(data) ?? error.message;
    const base = { ...context, responseData: data, cause: error };

    if (status === undefined) {
      return new FinaleNetworkError({
        ...base,
        message: `${prefix}no response from Finale — ${error.message}`,
        errorCode: error.code,
      });
    }
    if (status === 429) {
      return new FinaleRateLimitError({
        ...base,
        message:
          `${prefix}rate limited by Finale (120 GET/min, 120 POST/min, 300 collection/hour)`,
        statusCode: status,
        resetAt: readQuota(error.response?.headers).resetAt,
      });
    }
    if (status === 401 || status === 403) {
      return new FinaleAuthError({
        ...base,
        message:
          `${prefix}Finale rejected the credentials (${status}) — ${detail}. ` +
          `Check the API key, secret and account path.`,
        statusCode: status,
      });
    }
    if (status >= 400 && status < 500) {
      return new FinaleClientError({
        ...base,
        message: `${prefix}Finale rejected the request (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    if (status >= 500) {
      return new FinaleServerError({
        ...base,
        message: `${prefix}Finale server error (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    return new FinaleApiError({
      ...base,
      message: `${prefix}unexpected Finale response (${status}) — ${detail}`,
      statusCode: status,
    });
  }

  return new FinaleApiError({
    ...context,
    message: `${where(context)}${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** Runs a call and translates whatever it throws. */
export async function guard<T>(
  context: FinaleErrorContext,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw translateFinaleError(error, context);
  }
}
