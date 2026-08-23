/**
 * Configuration for the Pipedrive client.
 *
 * Two authentication modes, and the client sends whichever is supplied:
 *
 * - **API token** — `x-api-token: <token>`. Taken from Pipedrive under
 *   Settings > Personal preferences > API. Fixed to one company and one user.
 * - **OAuth 2.0** — `Authorization: Bearer <accessToken>`, for marketplace apps.
 *
 * The token is sent as a **header**, never as the `api_token` query parameter. The query form
 * still works but puts the credential in URLs, which then reach access logs and error
 * reporting; several of Pipedrive's own guides show it, so it is worth stating that this
 * client deliberately does not.
 *
 * This client does not refresh OAuth tokens. A host using OAuth owns the refresh cycle and
 * constructs a new client, or mutates `credentials.accessToken`, when it rotates one.
 */

/** Structured logger. Matches the interface the other connectors expect. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Wraps a call so the host can throttle it. `RateLimiter.acquire` fits as-is. */
export type Gate = <T>(fn: () => Promise<T>) => Promise<T>;

/** A personal or company API token, sent as `x-api-token`. */
export interface PipedriveApiTokenCredentials {
  apiToken: string;
  accessToken?: never;
}

/** An OAuth 2.0 access token, sent as `Authorization: Bearer`. */
export interface PipedriveOAuthCredentials {
  accessToken: string;
  apiToken?: never;
}

/** Never logged, never attached to an error's `responseData`. */
export type PipedriveCredentials = PipedriveApiTokenCredentials | PipedriveOAuthCredentials;

export interface PipedriveConnectorConfig {
  credentials: PipedriveCredentials;

  /**
   * Overrides the API root. Defaults to `https://api.pipedrive.com`.
   *
   * The version segment is **not** part of this: the client appends `/api/v2` or `/v1` per
   * request, because Pipedrive splits its surface across both. See `PipedriveApiVersion`.
   */
  baseUrl?: string;

  /** Request timeout in ms. Defaults to 20000. */
  timeoutMs?: number;

  /**
   * Retry attempts after the first failure, for retryable errors only. Defaults to 2.
   *
   * Low on purpose: behind a durable queue the queue provides retries across process
   * restarts, which an in-process loop cannot. Only a transient blip inside one invocation
   * is worth retrying here.
   */
  maxRetries?: number;
  /** First backoff step in ms. Defaults to 500. */
  retryBaseDelayMs?: number;
  /**
   * Backoff ceiling in ms. Defaults to 5000.
   *
   * Deliberately short relative to Pipedrive's daily budget: once the **daily** budget is
   * exhausted the reset can be hours away, and no worker should sleep for that. Failing and
   * letting the queue retry later is the right response — see `PipedriveRateLimitError`.
   */
  retryMaxDelayMs?: number;

  /**
   * Host-supplied throttle.
   *
   * Worth supplying for pollers. Pipedrive enforces a **rolling 2-second burst window** per
   * user, sized by plan (Lite 20, Growth 40, Premium 100, Ultimate 120 requests), on top of
   * the daily token budget. A paging loop with no gate trips the burst window long before
   * the daily budget runs out.
   */
  gate?: Gate;
  logger?: Logger;
}

/**
 * Remaining budget, read from Pipedrive's response headers.
 *
 * Pipedrive meters two separate things and only one of them is in `x-ratelimit-*`:
 *
 * - `limit`/`remaining`/`resetSeconds` describe the **burst window** (rolling 2 seconds).
 * - `dailyRequestsLeft` is what is left of the **daily token budget**, which resets every
 *   24 hours and is the one that ends a sync run for the day.
 *
 * Requests are priced in tokens rather than counted, so `dailyRequestsLeft` falls in uneven
 * steps: roughly 2 for a single-entity read, 20 for a list, 10 for an update, and 40 for a
 * search. A search-heavy matching loop drains the budget about twenty times faster than the
 * same number of reads — which is why the resources here prefer filtered list reads over
 * `/search` wherever a field can be filtered on directly.
 */
export interface PipedriveQuota {
  /** Burst-window ceiling, from `x-ratelimit-limit`. */
  limit?: number;
  /** Burst-window headroom, from `x-ratelimit-remaining`. */
  remaining?: number;
  /** Seconds until the burst window resets, from `x-ratelimit-reset`. A duration, not a timestamp. */
  resetSeconds?: number;
  /** Remaining daily token budget, from `x-daily-requests-left`. */
  dailyRequestsLeft?: number;
  observedAt: Date;
}
