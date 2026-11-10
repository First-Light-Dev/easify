/**
 * The ShipStation HTTP client: one axios instance, auth, retry, throttling, quota
 * tracking and error translation.
 *
 * Simpler than the Finale client because there is no session to manage — the API key is
 * static, so auth is a header set once at construction rather than state to refresh.
 *
 * Ordering inside `request()` matches the other connectors: `retry( gate( send ) )`.
 * The gate sits **inside** retry because each retry is a fresh HTTP request that must be
 * counted by the host's limiter. Nested the other way, retries would bypass throttling —
 * worst of all when the thing being retried is a 429.
 *
 * Rate-limit headers are read on every response, including successful ones. ShipStation
 * V1 allows 40 requests/minute and reports remaining quota on each reply, so the host can
 * see it running low rather than learning the limit from a 429.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  ShipStationApiError,
  readQuota,
  translateShipStationError,
  type ShipStationErrorContext,
} from '../errors/index';
import type {
  Gate,
  Logger,
  ShipStationConnectorConfig,
  ShipStationQuota,
} from '../types/config';

/** VERIFY: ShipStation V1's documented host. V2 is `https://api.shipstation.com`. */
const DEFAULT_BASE_URL = 'https://ssapi.shipstation.com';

const DEFAULTS = {
  timeoutMs: 15_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 10_000,
} as const;

export interface ShipStationRequestOptions extends ShipStationErrorContext {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, unknown>;
  body?: unknown;
}

export class ShipStationHttpClient {
  private readonly http: AxiosInstance;
  private readonly gate: Gate;
  private readonly logger?: Logger;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  /** Most recent quota reading, from the last response's headers. */
  private quota: ShipStationQuota | null = null;

  constructor(config: ShipStationConnectorConfig) {
    this.logger = config.logger;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.baseDelayMs = config.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs;
    this.maxDelayMs = config.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs;
    // No gate means no throttling — correct behind Cloud Tasks, which already serialises.
    this.gate = config.gate ?? ((fn) => fn());

    this.http = axios.create({
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeoutMs ?? DEFAULTS.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.authHeader(config),
      },
    });
  }

  /**
   * Builds the auth header for the configured mode.
   *
   * V1 wants `Authorization: Basic base64(key:secret)`; V2 wants `API-Key: <key>`. The
   * mode is configurable because which one the 3PL's account uses is unconfirmed, and
   * getting it wrong produces a 401 that looks like bad credentials rather than the wrong
   * API — hence the hint in the auth error message.
   */
  private authHeader(config: ShipStationConnectorConfig): Record<string, string> {
    const mode = config.authMode ?? 'basic';
    const { apiKey, apiSecret } = config.credentials;

    if (mode === 'api-key') return { 'API-Key': apiKey };

    if (!apiSecret) {
      throw new TypeError(
        'ShipStation basic auth (V1) needs both apiKey and apiSecret. If the account is ' +
          'on V2, set authMode: "api-key" and baseUrl: "https://api.shipstation.com".'
      );
    }
    const encoded = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  /** Remaining quota as of the last response, or null if nothing has been called yet. */
  getQuota(): ShipStationQuota | null {
    return this.quota;
  }

  async get<T>(path: string, params?: Record<string, unknown>, context?: ShipStationErrorContext) {
    return this.request<T>({ method: 'GET', path, params, ...context });
  }

  async post<T>(path: string, body: unknown, context?: ShipStationErrorContext) {
    return this.request<T>({ method: 'POST', path, body, ...context });
  }

  /** Sends one logical request, with retry, throttling and translation applied. */
  async request<T>(options: ShipStationRequestOptions): Promise<T> {
    const context: ShipStationErrorContext = {
      operation: options.operation ?? `${options.method} ${options.path}`,
      recordId: options.recordId,
    };

    let attempt = 0;

    for (;;) {
      try {
        return await this.gate(() => this.send<T>(options));
      } catch (error) {
        const failure = translateShipStationError(error, context);

        if (!failure.retryable || attempt >= this.maxRetries) {
          if (failure.retryable) {
            this.logger?.error('ShipStation call failed after exhausting retries', {
              ...context,
              attempts: attempt + 1,
              error: failure.name,
              message: failure.message,
            });
          }
          throw failure;
        }

        const delayMs = this.delayFor(attempt, failure);
        attempt += 1;
        this.logger?.warn('ShipStation call failed, retrying', {
          ...context,
          attempt,
          of: this.maxRetries,
          delayMs,
          error: failure.name,
        });
        await sleep(delayMs);
      }
    }
  }

  private async send<T>(options: ShipStationRequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {
      method: options.method,
      url: options.path,
      params: options.params,
      data: options.body,
    };

    const response = await this.http.request<T>(config);

    // Read quota on success too: the point is to see it running low before a 429, not
    // after one.
    this.recordQuota(response.headers);

    return response.data;
  }

  private recordQuota(headers: unknown): void {
    const { limit, remaining, resetSeconds } = readQuota(headers);
    if (limit === undefined && remaining === undefined) return;

    this.quota = { limit, remaining, resetSeconds, observedAt: new Date() };

    // Warn while there is still room to react. Silence until 429 is too late.
    if (remaining !== undefined && limit !== undefined && remaining <= Math.ceil(limit * 0.1)) {
      this.logger?.warn('ShipStation rate-limit quota nearly exhausted', {
        limit,
        remaining,
        resetSeconds,
      });
    }
  }

  /**
   * Backoff for the next attempt.
   *
   * A 429's `X-Rate-Limit-Reset` wins over computed backoff — ShipStation is stating
   * exactly when the window rolls, which beats guessing — but is clamped to `maxDelayMs`
   * so a large value cannot park a worker past its timeout. Jitter is applied inside the
   * cap, so no wait exceeds the stated ceiling.
   */
  private delayFor(attempt: number, failure: ShipStationApiError): number {
    const resetSeconds = (failure as { resetSeconds?: number }).resetSeconds;
    if (resetSeconds !== undefined && resetSeconds > 0) {
      return Math.min(resetSeconds * 1000, this.maxDelayMs);
    }

    const capped = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
    const half = capped / 2;
    return Math.round(half + Math.random() * half);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
