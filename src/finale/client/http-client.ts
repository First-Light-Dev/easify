/**
 * The Finale HTTP client. One axios instance shared by every resource, handling Basic auth,
 * retry, throttling, quota tracking, column-major transposition and error translation.
 *
 * Every path is namespaced by account: `https://app.finaleinventory.com/{accountPath}/api/...`.
 * Auth is a static key sent as `Authorization: Basic base64(apiKey:apiSecret)` — there is no
 * session to establish or refresh.
 *
 * Finale uses POST for both creates and updates, so this client deliberately has no `put()`.
 *
 * Retry wraps the gate rather than the other way round, so each attempt is counted by the
 * host's rate limiter. Nested the other way, retries would slip past throttling — worst of all
 * when the thing being retried is a 429.
 *
 * Finale enforces 120 GET/min, 120 POST/min and 300 collection requests per hour. The hourly
 * one is the trap: a poller ticking every minute across four collections spends 240 an hour
 * before any paging, so the per-minute headroom looks comfortable while the hourly budget runs
 * out. `getQuota()` surfaces what is left.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  FinaleApiError,
  FinaleResponseError,
  describeFinaleBody,
  looksLikeFinaleFailure,
  readQuota,
  translateFinaleError,
  type FinaleErrorContext,
} from '../errors/index';
import { transposeCollection } from '../types/common';
import type {
  FinaleConnectorConfig,
  FinaleQuota,
  Gate,
  Logger,
} from '../types/config';

const DEFAULT_BASE_URL = 'https://app.finaleinventory.com';

const DEFAULTS = {
  timeoutMs: 20_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 5_000,
} as const;

export interface FinaleRequestOptions extends FinaleErrorContext {
  /** Finale uses POST for creates and updates alike; there is no PUT. */
  method: 'GET' | 'POST' | 'DELETE';
  /** Path after the `/{account}/api/` prefix, e.g. `order` or `order/100045`. */
  path: string;
  params?: Record<string, unknown>;
  body?: unknown;
}

export class FinaleHttpClient {
  readonly accountPath: string;

  private readonly http: AxiosInstance;
  private readonly gate: Gate;
  private readonly logger?: Logger;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private quota: FinaleQuota | null = null;

  constructor(config: FinaleConnectorConfig) {
    const { accountPath, apiKey, apiSecret } = config.credentials;

    if (!accountPath || !apiKey || !apiSecret) {
      throw new TypeError(
        'Finale needs accountPath, apiKey and apiSecret. Keys are created under ' +
          'Settings > Users > API keys; the secret is shown only once at creation.'
      );
    }

    this.accountPath = accountPath;
    this.logger = config.logger;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.baseDelayMs = config.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs;
    this.maxDelayMs = config.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs;
    // No gate means no throttling — correct behind Cloud Tasks, which already serialises.
    this.gate = config.gate ?? ((fn) => fn());

    const encoded = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');

    this.http = axios.create({
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeoutMs ?? DEFAULTS.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${encoded}`,
      },
    });
  }

  /** Full path for a resource, including the account segment Finale namespaces by. */
  url(path: string): string {
    return `/${this.accountPath}/api/${path.replace(/^\/+/, '')}`;
  }

  /** Remaining quota as of the last response, or null before any call. */
  getQuota(): FinaleQuota | null {
    return this.quota;
  }

  async get<T>(path: string, params?: Record<string, unknown>, context?: FinaleErrorContext) {
    return this.request<T>({ method: 'GET', path, params, ...context });
  }

  /** Creates or updates — Finale uses POST for both. */
  async post<T>(path: string, body: unknown, context?: FinaleErrorContext) {
    return this.request<T>({ method: 'POST', path, body, ...context });
  }

  /**
   * Reads a collection and turns it into an array of records.
   *
   * Finale returns collections column-major — `{ orderId: [...], orderUrl: [...] }` rather than
   * a list of objects. Code that expects rows gets zero records instead of an error, so every
   * collection read goes through here and the conversion happens in exactly one place.
   */
  async getCollection<T>(
    path: string,
    params?: Record<string, unknown>,
    context?: FinaleErrorContext
  ): Promise<T[]> {
    const raw = await this.get<unknown>(path, params, context);
    return transposeCollection<T>(raw);
  }

  /** Sends one logical request, with retry, throttling and translation applied. */
  async request<T>(options: FinaleRequestOptions): Promise<T> {
    const context: FinaleErrorContext = {
      operation: options.operation ?? `${options.method} ${options.path}`,
      recordId: options.recordId,
    };

    let attempt = 0;

    for (;;) {
      try {
        return await this.gate(() => this.send<T>(options, context));
      } catch (error) {
        const failure = translateFinaleError(error, context);

        if (!failure.retryable || attempt >= this.maxRetries) {
          if (failure.retryable) {
            this.logger?.error('Finale call failed after exhausting retries', {
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
        this.logger?.warn('Finale call failed, retrying', {
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

  private async send<T>(
    options: FinaleRequestOptions,
    context: FinaleErrorContext
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      method: options.method,
      url: this.url(options.path),
      params: options.params,
      data: options.body,
    };

    const response = await this.http.request<T>(config);

    // Read quota on success too: the point is to see the hourly collection budget running
    // down before a 429, not after one.
    this.recordQuota(response.headers);

    // Finale can answer a failed write with a 200 and an error body. Trusting the status
    // alone would record a successful sync for an order that does not exist, and the host
    // would then wait forever for a receipt against it.
    if (looksLikeFinaleFailure(response.data)) {
      throw new FinaleResponseError({
        ...context,
        message:
          `${context.operation ?? 'Finale call'} returned 200 but the body reports a failure — ` +
          `${describeFinaleBody(response.data) ?? 'no detail given'}`,
        statusCode: response.status,
        responseData: response.data,
      });
    }

    return response.data;
  }

  private recordQuota(headers: unknown): void {
    const { limit, remaining, resetAt } = readQuota(headers);
    if (limit === undefined && remaining === undefined) return;

    this.quota = { limit, remaining, resetAt, observedAt: new Date() };

    if (remaining !== undefined && limit !== undefined && remaining <= Math.ceil(limit * 0.1)) {
      this.logger?.warn('Finale rate-limit quota nearly exhausted', {
        limit,
        remaining,
        resetAt,
      });
    }
  }

  /**
   * Backoff for the next attempt.
   *
   * Finale's `X-RateLimit-Reset` is a **Unix timestamp**, not a duration — so it is
   * converted to a wait here. Clamped to `maxDelayMs`, because the hourly collection limit
   * can put that reset up to an hour away and no queue worker should sleep that long: the
   * right response there is to fail and let Cloud Tasks retry later.
   */
  private delayFor(attempt: number, failure: FinaleApiError): number {
    const resetAt = (failure as { resetAt?: number }).resetAt;
    if (resetAt !== undefined) {
      const waitMs = resetAt * 1000 - Date.now();
      if (waitMs > 0) return Math.min(waitMs, this.maxDelayMs);
    }

    const capped = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
    const half = capped / 2;
    return Math.round(half + Math.random() * half);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
