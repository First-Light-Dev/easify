/**
 * Configuration for the ShipStation client.
 *
 * ⚠ PROVENANCE. Nothing in this module comes from documentation supplied for this
 * project — no ShipStation endpoint, auth model or payload shape reached the build.
 * It is written against ShipStation's **publicly documented V1 API**
 * (`ssapi.shipstation.com`, HTTP Basic with an API key and secret,
 * `POST /orders/createorder`) and every endpoint carries a `VERIFY` marker.
 *
 * ShipStation runs two incompatible APIs, and which one the 3PL's account uses changes
 * the host, the auth header and the payload shape:
 *
 *   V1  https://ssapi.shipstation.com   Basic  base64(apiKey:apiSecret)
 *   V2  https://api.shipstation.com     header `API-Key: <key>`
 *
 * So `baseUrl` and `authMode` are configuration rather than constants. If the account
 * turns out to be on V2, switching is config plus new payload types — not a rewrite of
 * the client, error handling or retry logic.
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
 * How credentials are presented.
 *
 * `basic` — V1: `Authorization: Basic base64(key:secret)`
 * `api-key` — V2: `API-Key: <key>`, secret unused
 */
export type ShipStationAuthMode = 'basic' | 'api-key';

export interface ShipStationCredentials {
  apiKey: string;
  /** Required for `basic`; ignored for `api-key`. */
  apiSecret?: string;
}

export interface ShipStationConnectorConfig {
  credentials: ShipStationCredentials;

  /** Defaults to `basic` (V1). See the note above. */
  authMode?: ShipStationAuthMode;

  /**
   * Overrides the API root. Defaults to `https://ssapi.shipstation.com` (V1).
   *
   * VERIFY which API the 3PL's account is on before the first live call.
   */
  baseUrl?: string;

  /** Request timeout in ms. Defaults to 15000. */
  timeoutMs?: number;

  /**
   * Retry attempts after the first failure, for retryable errors only. Defaults to 2.
   *
   * Low on purpose: behind Cloud Tasks the queue provides durable retries across
   * process restarts, which an in-process loop cannot. Only a transient blip inside one
   * invocation is worth retrying here.
   */
  maxRetries?: number;
  /** First backoff step in ms. Defaults to 500. */
  retryBaseDelayMs?: number;
  /** Backoff ceiling in ms. Defaults to 10000. */
  retryMaxDelayMs?: number;

  /**
   * ShipStation's store id, stamped on created orders via `advancedOptions.storeId`.
   *
   * VERIFY whether the 3PL requires it. An account with several stores may route or
   * reject orders based on it, and a missing storeId can land an order in the wrong
   * store rather than failing outright — which is worse.
   */
  storeId?: number;

  /** Host-supplied throttle. See `Gate`. */
  gate?: Gate;
  logger?: Logger;
}

/**
 * Quota reported by ShipStation's rate-limit response headers.
 *
 * V1 documents a 40-requests-per-minute limit and returns `X-Rate-Limit-Limit`,
 * `X-Rate-Limit-Remaining` and `X-Rate-Limit-Reset` on every response. Surfaced so the
 * host can log how close it is running rather than discovering the limit only through
 * a 429.
 */
export interface ShipStationQuota {
  limit?: number;
  remaining?: number;
  /** Seconds until the window resets. */
  resetSeconds?: number;
  observedAt: Date;
}
