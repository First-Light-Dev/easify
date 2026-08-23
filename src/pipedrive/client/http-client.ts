/**
 * The Pipedrive HTTP client. One axios instance shared by every resource, handling auth,
 * retry, throttling, quota tracking, envelope unwrapping, cursor paging and error
 * translation.
 *
 * **Pipedrive's surface spans two API versions and this client spans both.** v2 is the
 * current API and covers deals, persons, organizations, products and every `*Fields`
 * endpoint. Webhooks and notes exist only on v1. So the version is a per-request choice
 * (`/api/v2/...` vs `/v1/...`) rather than something baked into `baseURL`, and each resource
 * declares which it needs. Getting this wrong returns a 404 that reads like a missing record.
 *
 * Retry wraps the gate rather than the other way round, so each attempt is counted by the
 * host's rate limiter. Nested the other way, retries would slip past throttling — worst of
 * all when the thing being retried is a 429.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  PipedriveApiError,
  PipedriveCredentialsError,
  PipedriveRateLimitError,
  PipedriveResponseError,
  describePipedriveBody,
  looksLikePipedriveFailure,
  readQuota,
  translatePipedriveError,
  type PipedriveErrorContext,
} from '../errors/index';
import {
  MAX_PAGE_LIMIT,
  type PipedriveEnvelope,
  type PipedriveListOptions,
} from '../types/common';
import type { Gate, Logger, PipedriveConnectorConfig, PipedriveQuota } from '../types/config';

const DEFAULT_BASE_URL = 'https://api.pipedrive.com';

const DEFAULTS = {
  timeoutMs: 20_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 5_000,
} as const;

/** Which of Pipedrive's two API versions a request targets. */
export type PipedriveApiVersion = 'v1' | 'v2';

export interface PipedriveRequestOptions extends PipedriveErrorContext {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path after the version prefix, e.g. `deals` or `deals/42/products`. */
  path: string;
  /** Defaults to v2. Use v1 only for webhooks and notes. */
  version?: PipedriveApiVersion;
  params?: Record<string, unknown>;
  body?: unknown;
}

export class PipedriveHttpClient {
  private readonly http: AxiosInstance;
  private readonly gate: Gate;
  private readonly logger?: Logger;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private quota: PipedriveQuota | null = null;

  constructor(config: PipedriveConnectorConfig) {
    const { apiToken, accessToken } = config.credentials as {
      apiToken?: string;
      accessToken?: string;
    };

    if (!apiToken && !accessToken) {
      throw new PipedriveCredentialsError({
        message:
          'Pipedrive needs either an apiToken or an OAuth accessToken. A personal API token ' +
          'is found under Settings > Personal preferences > API.',
      });
    }

    this.logger = config.logger;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.baseDelayMs = config.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs;
    this.maxDelayMs = config.retryMaxDelayMs ?? DEFAULTS.retryMaxDelayMs;
    // No gate means no throttling — correct behind a queue that already serialises.
    this.gate = config.gate ?? ((fn) => fn());

    // The token goes in a header, never the `api_token` query parameter: the query form puts
    // the credential into URLs, and from there into access logs and error reports.
    const auth: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : { 'x-api-token': apiToken as string };

    this.http = axios.create({
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeoutMs ?? DEFAULTS.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...auth,
      },
    });
  }

  /** Full path for a resource, including the version segment. */
  url(path: string, version: PipedriveApiVersion = 'v2'): string {
    const clean = path.replace(/^\/+/, '');
    return version === 'v2' ? `/api/v2/${clean}` : `/v1/${clean}`;
  }

  /** Remaining budget as of the last response, or null before any call. */
  getQuota(): PipedriveQuota | null {
    return this.quota;
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T> {
    return this.request<T>({ method: 'GET', path, params, ...context });
  }

  async post<T>(
    path: string,
    body: unknown,
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, ...context });
  }

  /** v2 uses PATCH for updates. v1 used PUT — see `put` for the endpoints still on it. */
  async patch<T>(
    path: string,
    body: unknown,
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body, ...context });
  }

  async put<T>(
    path: string,
    body: unknown,
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body, ...context });
  }

  async delete<T>(
    path: string,
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T> {
    return this.request<T>({ method: 'DELETE', path, ...context });
  }

  /**
   * Walks a cursor-paginated collection, yielding one page at a time.
   *
   * Termination is the **absence of `next_cursor`**, not an empty page. A row-count check
   * would be wrong in both directions: Pipedrive can return a short page that still has a
   * cursor, and an offset guessed from counts skips records when the collection changes
   * mid-walk.
   *
   * Defaults to the maximum page size. A list read costs roughly 20 tokens no matter how
   * many rows it returns, so paging in 500s rather than the server default of 100 spends a
   * fifth of the daily budget for the same data.
   */
  async *paginate<T>(
    path: string,
    params: PipedriveListOptions = {},
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): AsyncGenerator<T[], void, void> {
    let cursor = params.cursor;

    for (;;) {
      const page = await this.requestEnvelope<T[]>({
        method: 'GET',
        path,
        params: { limit: MAX_PAGE_LIMIT, ...params, cursor },
        ...context,
      });

      const rows = page.data ?? [];
      if (rows.length) yield rows;

      const next = page.additional_data?.next_cursor;
      if (!next) return;
      cursor = next;
    }
  }

  /** Collects every record from a cursor-paginated collection. */
  async listAll<T>(
    path: string,
    params: PipedriveListOptions = {},
    context?: PipedriveErrorContext & { version?: PipedriveApiVersion }
  ): Promise<T[]> {
    const all: T[] = [];
    for await (const page of this.paginate<T>(path, params, context)) all.push(...page);
    return all;
  }

  /** Sends one logical request and returns the unwrapped `data`. */
  async request<T>(options: PipedriveRequestOptions): Promise<T> {
    const envelope = await this.requestEnvelope<T>(options);
    return envelope.data;
  }

  /** As `request`, but keeps the envelope so paging can read `additional_data`. */
  async requestEnvelope<T>(options: PipedriveRequestOptions): Promise<PipedriveEnvelope<T>> {
    const context: PipedriveErrorContext = {
      operation: options.operation ?? `${options.method} ${options.path}`,
      recordId: options.recordId,
    };

    let attempt = 0;

    for (;;) {
      try {
        return await this.gate(() => this.send<T>(options, context));
      } catch (error) {
        const failure = translatePipedriveError(error, context);

        if (!this.shouldRetry(failure, attempt)) {
          if (failure.retryable) {
            this.logger?.error('Pipedrive call failed after exhausting retries', {
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
        this.logger?.warn('Pipedrive call failed, retrying', {
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

  /**
   * Whether to retry in-process.
   *
   * An exhausted **daily** budget is retryable in principle but not here: the reset can be
   * hours away, so burning the remaining attempts against it just delays the inevitable
   * failure. Failing immediately hands the work back to a durable queue, which can retry
   * after the budget resets.
   */
  private shouldRetry(failure: PipedriveApiError, attempt: number): boolean {
    if (!failure.retryable) return false;
    if (failure instanceof PipedriveRateLimitError && failure.dailyExhausted) return false;
    return attempt < this.maxRetries;
  }

  private async send<T>(
    options: PipedriveRequestOptions,
    context: PipedriveErrorContext
  ): Promise<PipedriveEnvelope<T>> {
    const config: AxiosRequestConfig = {
      method: options.method,
      url: this.url(options.path, options.version ?? 'v2'),
      params: options.params,
      data: options.body,
    };

    const response = await this.http.request<PipedriveEnvelope<T>>(config);

    // Read quota on success too: the point is to watch the daily budget draining before a
    // 429 arrives, not to discover it afterwards.
    this.recordQuota(response.headers);

    // Pipedrive can answer a rejected write with a 200 and `success: false`. Trusting the
    // status alone would record a successful sync for a deal that was never created.
    if (looksLikePipedriveFailure(response.data)) {
      throw new PipedriveResponseError({
        ...context,
        message:
          `${context.operation ?? 'Pipedrive call'} returned ${response.status} but the body ` +
          `reports a failure — ${describePipedriveBody(response.data) ?? 'no detail given'}`,
        statusCode: response.status,
        responseData: response.data,
      });
    }

    return response.data;
  }

  private recordQuota(headers: unknown): void {
    const { limit, remaining, resetSeconds, dailyRequestsLeft } = readQuota(headers);
    if (limit === undefined && remaining === undefined && dailyRequestsLeft === undefined) return;

    this.quota = { limit, remaining, resetSeconds, dailyRequestsLeft, observedAt: new Date() };

    // Warn on the daily budget rather than the burst window: the burst window refills in two
    // seconds and is not worth a log line, whereas the daily budget ending stops the
    // integration until tomorrow.
    if (dailyRequestsLeft !== undefined && dailyRequestsLeft <= 1000) {
      this.logger?.warn('Pipedrive daily token budget running low', {
        dailyRequestsLeft,
        burstRemaining: remaining,
      });
    }
  }

  /**
   * Backoff for the next attempt.
   *
   * `x-ratelimit-reset` is **seconds until the burst window resets** — a duration, not a
   * timestamp as it is in Finale. Clamped to `maxDelayMs` regardless.
   */
  private delayFor(attempt: number, failure: PipedriveApiError): number {
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
