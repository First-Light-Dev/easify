/**
 * Error classification for Pipedrive.
 *
 * The only file that knows what shape a Pipedrive failure arrives in. Everything above it
 * sees a `PipedriveApiError` subclass carrying a `retryable` flag, which is the one field
 * callers branch on — the same contract the Finale and ShipStation connectors expose, so a
 * host has one rule for retry-or-fail across vendors.
 *
 * Imports nothing — not axios. Foreign errors are duck-typed on axios's own `isAxiosError`
 * marker rather than `instanceof`, because `instanceof` silently returns false when two
 * copies of axios end up in the tree, and a mis-detected error would be classified UNKNOWN
 * and never retried.
 */

export interface PipedriveErrorContext {
  /** Connector method or endpoint, e.g. `createDeal`. */
  operation?: string;
  /** The record involved — deal id, person id, SKU. */
  recordId?: string | number;
}

export interface PipedriveApiErrorInput extends PipedriveErrorContext {
  message: string;
  statusCode?: number;
  responseData?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

/** Base error, and the fallback for anything unrecognised. */
export class PipedriveApiError extends Error {
  readonly statusCode: number;
  readonly responseData?: unknown;
  readonly retryable: boolean;
  readonly operation?: string;
  readonly recordId?: string | number;

  constructor(input: PipedriveApiErrorInput) {
    super(input.message);
    // Assigned rather than passed to `super`: easify targets es2018, where the `cause`
    // constructor option does not exist. The property behaves identically at runtime on any
    // Node this ships to, and this keeps the package off an ES2022 target for one field.
    if (input.cause !== undefined) {
      (this as { cause?: unknown }).cause = input.cause;
    }
    this.name = 'PipedriveApiError';
    this.statusCode = input.statusCode ?? 0;
    this.responseData = input.responseData;
    // Default false: retrying a mutation whose outcome is unknown risks duplicating it, so
    // retry is opt-in per class rather than assumed.
    this.retryable = input.retryable ?? false;
    this.operation = input.operation;
    this.recordId = input.recordId;
  }
}

/**
 * 401 — the token is wrong, revoked, or (for OAuth) expired.
 *
 * Not retryable. This client does not refresh OAuth tokens, so a 401 on an expired access
 * token will still be a 401 next attempt; the host owns the refresh and must build a new
 * client. Retrying here would only spend burst budget on a credential that cannot work.
 */
export class PipedriveAuthError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'PipedriveAuthError';
  }
}

/**
 * 403 — authenticated, but not allowed.
 *
 * Kept apart from 401 because the fix is different and an operator needs to know which: a
 * 401 means fix the token, a 403 means the token's user or OAuth scope lacks the permission.
 */
export class PipedriveForbiddenError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'PipedriveForbiddenError';
  }
}

/** Credentials are structurally wrong — detected locally, before any request. */
export class PipedriveCredentialsError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'PipedriveCredentialsError';
  }
}

/** 404 — no such record. Not retryable; it will still be absent next attempt. */
export class PipedriveNotFoundError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, statusCode: input.statusCode ?? 404, retryable: false });
    this.name = 'PipedriveNotFoundError';
  }
}

/**
 * 400/422 — the request is wrong. Never retried.
 *
 * The most common cause in practice is a custom field written under its **label** instead of
 * its hashed `field_code`. Pipedrive rejects the unknown key rather than ignoring it, so the
 * message is worth reading in full.
 */
export class PipedriveClientError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'PipedriveClientError';
  }
}

/**
 * 429 — over the burst window or out of daily budget. Retryable, but read `dailyExhausted`
 * before deciding how.
 *
 * The two cases behave very differently and Pipedrive reports both as 429:
 *
 * - **Burst** — a rolling 2-second window. Clears almost immediately; a short backoff works.
 * - **Daily budget** — resets on a 24-hour cycle. No in-process backoff can wait that out,
 *   so the right response is to fail and let a durable queue retry later. `dailyExhausted`
 *   is set when `x-daily-requests-left` reports nothing left, which is the only signal
 *   separating the two.
 */
export class PipedriveRateLimitError extends PipedriveApiError {
  /** Seconds until the burst window resets, from `x-ratelimit-reset`. */
  readonly resetSeconds?: number;
  /** True when the daily token budget is spent, not merely the 2-second burst window. */
  readonly dailyExhausted: boolean;

  constructor(input: PipedriveApiErrorInput & { resetSeconds?: number; dailyExhausted?: boolean }) {
    super({ ...input, statusCode: input.statusCode ?? 429, retryable: true });
    this.name = 'PipedriveRateLimitError';
    this.resetSeconds = input.resetSeconds;
    this.dailyExhausted = input.dailyExhausted ?? false;
  }
}

/** 5xx — Pipedrive is unwell. Retryable. */
export class PipedriveServerError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: true });
    this.name = 'PipedriveServerError';
  }
}

/** No response — DNS, TLS, socket, timeout. Retryable. */
export class PipedriveNetworkError extends PipedriveApiError {
  readonly errorCode: string;

  constructor(input: PipedriveApiErrorInput & { errorCode?: string }) {
    super({ ...input, statusCode: 0, retryable: true });
    this.name = 'PipedriveNetworkError';
    this.errorCode = input.errorCode ?? 'UNKNOWN';
  }
}

/**
 * A 200 whose envelope reports `success: false`.
 *
 * Its own class because Pipedrive can answer a rejected write with a 200 and a failure body.
 * Trusting the status alone would record a successful sync for a deal that was never
 * created, and the host would then wait forever for a record that does not exist.
 */
export class PipedriveResponseError extends PipedriveApiError {
  constructor(input: PipedriveApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'PipedriveResponseError';
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
 * Pulls something readable out of a Pipedrive error body.
 *
 * Pipedrive splits its message across `error` and `error_info`, and nests per-field detail
 * under `errors`. Without this, messages degrade to `Request failed with status code 400`,
 * which says nothing about which field was rejected — the single most useful fact when a
 * custom field code is wrong.
 */
export function describePipedriveBody(data: unknown): string | undefined {
  if (typeof data === 'string') return data.trim().slice(0, 500) || undefined;
  if (!isRecord(data)) return undefined;

  const parts: string[] = [];
  for (const key of ['error', 'error_info', 'message']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }

  const errors = data.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (typeof entry === 'string' && entry.trim()) parts.push(entry.trim());
      else if (isRecord(entry) && typeof entry.message === 'string') parts.push(entry.message);
    }
  } else if (isRecord(errors)) {
    // Per-field detail: `{ "title": "cannot be empty" }`.
    for (const [field, detail] of Object.entries(errors)) {
      parts.push(`${field}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
  }

  // De-duplicated: `error` and `error_info` often carry the same sentence.
  return parts.length ? Array.from(new Set(parts)).join('; ') : undefined;
}

/**
 * True when a 2xx envelope is actually reporting a failure.
 *
 * A missed failure here is silent — the caller records a sync that never happened — so this
 * checks the envelope flag explicitly rather than inferring from a missing `data`. Some
 * successful endpoints legitimately return `data: null` (a delete, an empty collection), so
 * absence of data is not itself a failure.
 */
export function looksLikePipedriveFailure(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (data.success === false) return true;
  if (typeof data.error === 'string' && data.error.trim()) return true;
  return false;
}

/**
 * Reads Pipedrive's rate-limit headers.
 *
 * Note the two different meters and the casing, both of which differ from the other
 * connectors in this package: Pipedrive sends `x-ratelimit-*` (no hyphen inside "ratelimit",
 * unlike ShipStation's `x-rate-limit-*`), and `x-ratelimit-reset` is **seconds until reset**
 * rather than a Unix timestamp, unlike Finale's.
 *
 * `x-daily-requests-left` is a separate meter entirely — the daily token budget, not the
 * burst window.
 */
export function readQuota(headers: unknown): {
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
  dailyRequestsLeft?: number;
} {
  if (!isRecord(headers)) return {};
  const num = (key: string): number | undefined => {
    const raw = headers[key] ?? headers[key.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    resetSeconds: num('x-ratelimit-reset'),
    dailyRequestsLeft: num('x-daily-requests-left'),
  };
}

function where(context: PipedriveErrorContext, fallback?: string): string {
  const parts = [
    context.operation ?? fallback,
    context.recordId !== undefined ? `(${context.recordId})` : undefined,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' ')}: ` : '';
}

// ─── Translation ──────────────────────────────────────────────────────────────

/**
 * Maps anything thrown beneath this package into the hierarchy above.
 *
 * Idempotent: an already-translated error is returned unchanged, so nesting guards cannot
 * re-wrap or lose the original classification.
 */
export function translatePipedriveError(
  error: unknown,
  context: PipedriveErrorContext = {}
): PipedriveApiError {
  if (error instanceof PipedriveApiError) return error;

  if (isAxiosLike(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const endpoint = error.config
      ? `${error.config.method?.toUpperCase() ?? 'REQUEST'} ${error.config.url ?? ''}`.trim()
      : undefined;
    const prefix = where(context, endpoint);
    const detail = describePipedriveBody(data) ?? error.message;
    const base = { ...context, responseData: data, cause: error };

    if (status === undefined) {
      return new PipedriveNetworkError({
        ...base,
        message: `${prefix}no response from Pipedrive — ${error.message}`,
        errorCode: error.code,
      });
    }
    if (status === 429) {
      const quota = readQuota(error.response?.headers);
      const dailyExhausted = quota.dailyRequestsLeft !== undefined && quota.dailyRequestsLeft <= 0;
      return new PipedriveRateLimitError({
        ...base,
        message: dailyExhausted
          ? `${prefix}Pipedrive daily token budget is exhausted — it resets on a 24-hour ` +
            `cycle, so this will not clear by retrying in-process`
          : `${prefix}rate limited by Pipedrive (rolling 2-second burst window)`,
        statusCode: status,
        resetSeconds: quota.resetSeconds,
        dailyExhausted,
      });
    }
    if (status === 401) {
      return new PipedriveAuthError({
        ...base,
        message:
          `${prefix}Pipedrive rejected the credentials (401) — ${detail}. ` +
          `Check the API token, or refresh the OAuth access token and rebuild the client.`,
        statusCode: status,
      });
    }
    if (status === 403) {
      return new PipedriveForbiddenError({
        ...base,
        message:
          `${prefix}Pipedrive refused the request (403) — ${detail}. ` +
          `The token is valid but its user or OAuth scope lacks permission.`,
        statusCode: status,
      });
    }
    if (status === 404) {
      return new PipedriveNotFoundError({
        ...base,
        message: `${prefix}not found in Pipedrive (404) — ${detail}`,
        statusCode: status,
      });
    }
    if (status >= 400 && status < 500) {
      return new PipedriveClientError({
        ...base,
        message: `${prefix}Pipedrive rejected the request (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    if (status >= 500) {
      return new PipedriveServerError({
        ...base,
        message: `${prefix}Pipedrive server error (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    return new PipedriveApiError({
      ...base,
      message: `${prefix}unexpected Pipedrive response (${status}) — ${detail}`,
      statusCode: status,
    });
  }

  return new PipedriveApiError({
    ...context,
    message: `${where(context)}${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}

/** Runs a call and translates whatever it throws. */
export async function guard<T>(
  context: PipedriveErrorContext,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw translatePipedriveError(error, context);
  }
}
