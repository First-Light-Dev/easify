/**
 * Shared CRUD for Pipedrive's v2 entity endpoints.
 *
 * Deals, persons, organizations and products expose the same verbs over the same cursor
 * paging and the same `updated_since` window, so it is defined once here and each resource
 * adds only what is genuinely specific to it.
 *
 * v2 updates with **PATCH**, not PUT — v1 used PUT, and sending one to v2 returns a 405 that
 * reads like a routing problem.
 */

import type { PipedriveHttpClient } from '../client/http-client';
import type { PipedriveErrorContext } from '../errors/index';
import {
  MAX_PAGE_LIMIT,
  toPipedriveTime,
  type PipedriveListOptions,
  type PipedriveSyncOptions,
} from '../types/common';

/** One page, plus the cursor needed to ask for the next. */
export interface PipedrivePage<T> {
  data: T[];
  nextCursor?: string | null;
}

/**
 * Normalises the sync window.
 *
 * `updated_since` must be `YYYY-MM-DD HH:MM:SS`, not ISO-8601. Pipedrive answers 200 and
 * ignores a malformed value, so the poller silently re-reads the whole collection every tick
 * instead of failing — this converts before the value can leave.
 */
function normaliseParams(options: PipedriveSyncOptions = {}): Record<string, unknown> {
  const params: Record<string, unknown> = { ...options };
  if (options.updated_since !== undefined) {
    params.updated_since = toPipedriveTime(options.updated_since);
  }
  if (options.updated_until !== undefined) {
    params.updated_until = toPipedriveTime(options.updated_until);
  }
  return params;
}

export abstract class PipedriveResource<
  TRecord,
  TInput,
  TListOptions extends PipedriveSyncOptions = PipedriveSyncOptions
> {
  constructor(
    protected readonly http: PipedriveHttpClient,
    /** The v2 collection path, e.g. `deals`. */
    protected readonly path: string,
    /** Used to build operation names in errors and logs, e.g. `Deal`. */
    protected readonly label: string
  ) {}

  protected context(operation: string, recordId?: string | number): PipedriveErrorContext {
    return { operation, recordId };
  }

  /** One record by id, or throws `PipedriveNotFoundError`. */
  async get(id: number | string, options: PipedriveListOptions = {}): Promise<TRecord> {
    return this.http.get<TRecord>(
      `${this.path}/${id}`,
      options,
      this.context(`get${this.label}`, id)
    );
  }

  /** One record by id, or null where absence is an expected outcome rather than an error. */
  async find(id: number | string, options: PipedriveListOptions = {}): Promise<TRecord | null> {
    try {
      return await this.get(id, options);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null;
      throw error;
    }
  }

  /**
   * A single page, with the cursor for the next one.
   *
   * Prefer `pages()` or `listAll()` unless the caller is persisting the cursor itself — for
   * example a poller that resumes a long backfill across invocations.
   */
  async list(options: TListOptions = {} as TListOptions): Promise<PipedrivePage<TRecord>> {
    const envelope = await this.http.requestEnvelope<TRecord[]>({
      method: 'GET',
      path: this.path,
      params: normaliseParams(options),
      ...this.context(`list${this.label}s`),
    });
    return { data: envelope.data ?? [], nextCursor: envelope.additional_data?.next_cursor };
  }

  /** Walks every page, yielding one at a time so a large collection is never held at once. */
  pages(options: TListOptions = {} as TListOptions): AsyncGenerator<TRecord[], void, void> {
    return this.http.paginate<TRecord>(
      this.path,
      { limit: MAX_PAGE_LIMIT, ...normaliseParams(options) },
      this.context(`list${this.label}s`)
    );
  }

  /** Collects every matching record. */
  async listAll(options: TListOptions = {} as TListOptions): Promise<TRecord[]> {
    const all: TRecord[] = [];
    for await (const page of this.pages(options)) all.push(...page);
    return all;
  }

  /**
   * Every record changed at or after a moment — the read every poller is built on.
   *
   * Sorted by `update_time` ascending so a caller can checkpoint the last record it processed
   * and resume from there. The bound is **inclusive**, so the checkpoint record comes back
   * again on the next run: writes driven by this must be idempotent.
   */
  async updatedSince(
    since: Date | string,
    options: Partial<TListOptions> = {}
  ): Promise<TRecord[]> {
    return this.listAll({
      sort_by: 'update_time',
      sort_direction: 'asc',
      ...options,
      updated_since: since,
    } as TListOptions);
  }

  /** Creates a record and returns it as Pipedrive stored it. */
  async create(input: TInput): Promise<TRecord> {
    return this.http.post<TRecord>(this.path, input, this.context(`create${this.label}`));
  }

  /** Partially updates a record. v2 uses PATCH; only the supplied fields change. */
  async update(id: number | string, input: Partial<TInput>): Promise<TRecord> {
    return this.http.patch<TRecord>(
      `${this.path}/${id}`,
      input,
      this.context(`update${this.label}`, id)
    );
  }

  /** Deletes a record. Pipedrive soft-deletes; the record stays readable with `is_deleted`. */
  async delete(id: number | string): Promise<{ id: number }> {
    return this.http.delete<{ id: number }>(
      `${this.path}/${id}`,
      this.context(`delete${this.label}`, id)
    );
  }
}
