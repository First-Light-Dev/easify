/**
 * Error classification for ShipStation.
 *
 * Same contract as the Cin7 and Finale connectors — every failure crossing the boundary
 * is a `ShipStationApiError` subclass carrying `retryable` — so the host has one rule for
 * deciding retry-or-fail across all three vendors.
 *
 * **A 401 is not retryable.** ShipStation authenticates with a static API key, so a 401
 * means the key is wrong — or that a V1 key is being sent to V2 — and will still be wrong
 * next attempt. Retrying would only hammer the endpoint with bad credentials.
 *
 * (An earlier revision noted this as a contrast with the Finale connector, on the
 * understanding that Finale used expiring sessions. Validation against Finale's current
 * docs disproved that: it is Basic auth with a static key too, so both connectors now treat
 * a 401 identically.)
 *
 * Imports nothing — not axios. Foreign errors are duck-typed on `isAxiosError`, because
 * `instanceof` silently returns false across two copies of a library and a mis-detected
 * error would be classified UNKNOWN and never retried.
 */

export interface ShipStationErrorContext {
  /** Connector method, e.g. `createOrder`. */
  operation?: string;
  /** The record involved — order number, SKU. */
  recordId?: string;
}

export interface ShipStationApiErrorInput extends ShipStationErrorContext {
  message: string;
  statusCode?: number;
  responseData?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

/** Base error, and the fallback for anything unrecognised. */
export class ShipStationApiError extends Error {
  readonly statusCode: number;
  readonly responseData?: unknown;
  readonly retryable: boolean;
  readonly operation?: string;
  readonly recordId?: string;

  constructor(input: ShipStationApiErrorInput) {
    super(input.message);
    // Assigned rather than passed to `super`: easify targets es2018, where the `cause`
    // constructor option does not exist. The property behaves identically at runtime on any
    // Node this ships to, and this keeps the whole package off an ES2022 target for one field.
    if (input.cause !== undefined) {
      (this as { cause?: unknown }).cause = input.cause;
    }
    this.name = 'ShipStationApiError';
    this.statusCode = input.statusCode ?? 0;
    this.responseData = input.responseData;
    // Retry is opt-in: re-sending a mutation whose outcome is unknown risks duplicating
    // it. ShipStation's upsert semantics soften that, but only when orderKey is set.
    this.retryable = input.retryable ?? false;
    this.operation = input.operation;
    this.recordId = input.recordId;
  }
}

/**
 * 401/403 — the API key or secret is wrong, or lacks permission.
 *
 * Never retryable. See the note at the top of this file: unlike Finale, there is no
 * session to refresh.
 */
export class ShipStationAuthError extends ShipStationApiError {
  constructor(input: ShipStationApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'ShipStationAuthError';
  }
}

/** 4xx other than auth and 429 — the payload is wrong. Never retried. */
export class ShipStationClientError extends ShipStationApiError {
  constructor(input: ShipStationApiErrorInput) {
    super({ ...input, retryable: false });
    this.name = 'ShipStationClientError';
  }
}

/**
 * 429 — over the documented 40 requests/minute (V1).
 *
 * Carries `resetSeconds` from `X-Rate-Limit-Reset` when present, which is more accurate
 * than exponential backoff because ShipStation states exactly when the window rolls.
 */
export class ShipStationRateLimitError extends ShipStationApiError {
  readonly resetSeconds?: number;

  constructor(input: ShipStationApiErrorInput & { resetSeconds?: number }) {
    super({ ...input, statusCode: input.statusCode ?? 429, retryable: true });
    this.name = 'ShipStationRateLimitError';
    this.resetSeconds = input.resetSeconds;
  }
}

/**
 * `createorder` was rejected because the order is no longer open.
 *
 * ShipStation only permits updates to orders in `awaiting_payment`, `awaiting_shipment` or
 * `on_hold`. Once the 3PL ships (or someone cancels), the upsert fails.
 *
 * This matters because it is the one case where a **retry of a create that already
 * succeeded** fails. Sequence: we create the order, the 3PL picks and ships it, then a late
 * Cloud Tasks retry fires — and the upsert now targets a shipped order. Without this class
 * the host records a failed sync for a transfer that completed perfectly.
 *
 * Non-retryable: no later attempt makes a shipped order updatable again. Carries the
 * existing order so the caller can confirm the work was in fact done.
 */
export class ShipStationOrderNotUpdatableError extends ShipStationApiError {
  /** The order as it currently stands, when a lookup confirmed it. */
  readonly existingOrder?: unknown;

  constructor(input: ShipStationApiErrorInput & { existingOrder?: unknown }) {
    super({ ...input, retryable: false });
    this.name = 'ShipStationOrderNotUpdatableError';
    this.existingOrder = input.existingOrder;
  }
}

/** 5xx — ShipStation is unwell. Retryable. */
export class ShipStationServerError extends ShipStationApiError {
  constructor(input: ShipStationApiErrorInput) {
    super({ ...input, retryable: true });
    this.name = 'ShipStationServerError';
  }
}

/**
 * No response — DNS, TLS, socket, timeout.
 *
 * Retryable, with two caveats the host must respect. A timeout on `createorder` may have
 * been applied server-side before the socket died, so a retry is safe **only** because
 * `createorder` upserts on `orderKey` — without one, a retry creates a duplicate and the 3PL
 * ships twice.
 *
 * And that upsert protection ends once the order leaves an open status: a retry arriving
 * after the 3PL has shipped is rejected, not absorbed. `ShipStationOrderNotUpdatableError`
 * exists to make that outcome distinguishable from a genuine failure.
 */
export class ShipStationNetworkError extends ShipStationApiError {
  readonly errorCode: string;

  constructor(input: ShipStationApiErrorInput & { errorCode?: string }) {
    super({ ...input, statusCode: 0, retryable: true });
    this.name = 'ShipStationNetworkError';
    this.errorCode = input.errorCode ?? 'UNKNOWN';
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
 * Pulls something readable out of a ShipStation error body.
 *
 * V1 returns `{ "message": "...", "ExceptionMessage": "...", "ModelState": { field: [...] } }`
 * depending on the failure. `ModelState` is the useful one for a rejected payload — it
 * names the offending field, which a bare status code does not.
 *
 * VERIFY against real responses.
 */
export function describeShipStationBody(data: unknown): string | undefined {
  if (typeof data === 'string') return data.trim().slice(0, 500) || undefined;
  if (!isRecord(data)) return undefined;

  const parts: string[] = [];
  for (const key of ['ExceptionMessage', 'message', 'Message', 'error']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }

  // ModelState: { "order.shipTo.postalCode": ["The field is required"] }
  const modelState = data.ModelState ?? data.modelState;
  if (isRecord(modelState)) {
    for (const [field, messages] of Object.entries(modelState)) {
      if (Array.isArray(messages)) {
        parts.push(`${field}: ${messages.filter((m) => typeof m === 'string').join(', ')}`);
      }
    }
  }

  return parts.length ? parts.join('; ') : undefined;
}

/** Reads the rate-limit headers ShipStation returns on every response. */
export function readQuota(headers: unknown): {
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
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
    limit: num('X-Rate-Limit-Limit'),
    remaining: num('X-Rate-Limit-Remaining'),
    resetSeconds: num('X-Rate-Limit-Reset'),
  };
}

/**
 * Whether a 400 is ShipStation refusing to update a non-open order.
 *
 * VERIFY: matched on message text because ShipStation returns a plain 400 with no
 * distinguishing code. The patterns below are best-effort — replace them once a real
 * rejection is captured. `createOrder` does not rely on this alone; it confirms by looking
 * the order up, so a false positive here cannot invent a success.
 */
export function looksLikeNotUpdatable(data: unknown): boolean {
  const text = describeShipStationBody(data)?.toLowerCase();
  if (!text) return false;
  return (
    (text.includes('cannot') || text.includes('not') || text.includes('unable')) &&
    (text.includes('update') || text.includes('modify')) &&
    (text.includes('shipped') || text.includes('cancelled') || text.includes('canceled') ||
      text.includes('open status') || text.includes('status'))
  );
}

function where(context: ShipStationErrorContext, fallback?: string): string {
  const parts = [
    context.operation ?? fallback,
    context.recordId ? `(${context.recordId})` : undefined,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' ')}: ` : '';
}

// ─── Translation ──────────────────────────────────────────────────────────────

/** Maps anything thrown beneath this package into the hierarchy above. Idempotent. */
export function translateShipStationError(
  error: unknown,
  context: ShipStationErrorContext = {}
): ShipStationApiError {
  if (error instanceof ShipStationApiError) return error;

  if (isAxiosLike(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const endpoint = error.config
      ? `${error.config.method?.toUpperCase() ?? 'REQUEST'} ${error.config.url ?? ''}`.trim()
      : undefined;
    const prefix = where(context, endpoint);
    const detail = describeShipStationBody(data) ?? error.message;
    const base = { ...context, responseData: data, cause: error };

    if (status === undefined) {
      return new ShipStationNetworkError({
        ...base,
        message: `${prefix}no response from ShipStation — ${error.message}`,
        errorCode: error.code,
      });
    }
    if (status === 429) {
      return new ShipStationRateLimitError({
        ...base,
        message: `${prefix}rate limited by ShipStation (40 requests/minute on V1)`,
        statusCode: status,
        resetSeconds: readQuota(error.response?.headers).resetSeconds,
      });
    }
    if (status === 401 || status === 403) {
      return new ShipStationAuthError({
        ...base,
        message:
          `${prefix}ShipStation rejected the credentials (${status}) — ${detail}. ` +
          `Check the API key/secret and whether the account is on V1 or V2.`,
        statusCode: status,
      });
    }
    if (status >= 400 && status < 500) {
      return new ShipStationClientError({
        ...base,
        message: `${prefix}ShipStation rejected the request (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    if (status >= 500) {
      return new ShipStationServerError({
        ...base,
        message: `${prefix}ShipStation server error (${status}) — ${detail}`,
        statusCode: status,
      });
    }
    return new ShipStationApiError({
      ...base,
      message: `${prefix}unexpected ShipStation response (${status}) — ${detail}`,
      statusCode: status,
    });
  }

  return new ShipStationApiError({
    ...context,
    message: `${where(context)}${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  });
}
