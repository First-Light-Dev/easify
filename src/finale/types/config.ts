/**
 * Configuration for the Finale client.
 *
 * Auth is HTTP Basic with a static API key and secret:
 *
 *     Authorization: Basic base64(apiKey:apiSecret)
 *
 * Keys are created in Finale under Settings > Users > API keys, and the secret is shown once
 * at creation. There is no session to establish, refresh or cache.
 *
 * `accountPath` is the account segment every request is namespaced by — the `newcentury` in
 * `https://app.finaleinventory.com/newcentury/api/order`.
 *
 * `gate` and the retry settings let the host decide how requests are paced. Behind a serialised
 * queue no gate is needed; in a process making concurrent calls it is what keeps Finale's
 * hourly collection budget intact.
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

/**
 * Credentials. Never logged, never attached to an error's `responseData`.
 *
 * `accountPath` is the account segment every Finale URL is namespaced by — the
 * `newcentury` in `https://app.finaleinventory.com/newcentury/api/order`.
 */
export interface FinaleCredentials {
  accountPath: string;
  apiKey: string;
  apiSecret: string;
}

export interface FinaleConnectorConfig {
  credentials: FinaleCredentials;

  /** Overrides the API root. Defaults to `https://app.finaleinventory.com` (verified). */
  baseUrl?: string;

  /** Request timeout in ms. Defaults to 20000 — collection reads can be slow. */
  timeoutMs?: number;

  /**
   * Retry attempts after the first failure, for retryable errors only. Defaults to 2.
   *
   * Low on purpose: behind Cloud Tasks the queue provides durable retries across process
   * restarts, which an in-process loop cannot. Only a transient blip inside one
   * invocation is worth retrying here.
   */
  maxRetries?: number;
  /** First backoff step in ms. Defaults to 500. */
  retryBaseDelayMs?: number;
  /** Backoff ceiling in ms. Defaults to 5000. */
  retryMaxDelayMs?: number;

  /**
   * Host-supplied throttle.
   *
   * Worth supplying for pollers. Finale's documented limits are 120 GET/min, 120 POST/min
   * and — the one that bites — **300 collection requests per hour**. A poller ticking
   * every 60s across four collections is 240/hour before any paging, so paging a backlog
   * can exhaust the hourly budget while the per-minute one looks fine.
   */
  gate?: Gate;
  logger?: Logger;
}

/**
 * Rate-limit quota from Finale's response headers.
 *
 * Note the casing: Finale sends `X-RateLimit-*` while ShipStation sends `X-Rate-Limit-*`.
 * Each connector reads its own.
 */
export interface FinaleQuota {
  limit?: number;
  remaining?: number;
  /** Unix timestamp (seconds) when the window resets — not a duration. */
  resetAt?: number;
  observedAt: Date;
}
