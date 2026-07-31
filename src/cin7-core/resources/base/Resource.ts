import { AxiosInstance } from 'axios';
import { z } from 'zod';

/**
 * Query parameters accepted by Cin7 Core list endpoints.
 * See https://dearinventory.docs.apiary.io/#introduction/pagination
 */
export interface QueryOptions {
  /** 1-based page number. Defaults to 1. */
  Page?: number;
  /** Rows per page. Defaults to 100, maximum 1000. */
  Limit?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface ResourceOptions {
  /** Parses responses with the generated schemas. Defaults to true. */
  validate?: boolean;
}

/** The largest page size the API accepts. */
export const MAX_LIMIT = 1000;

/** A page of records unwrapped from Cin7 Core's `{ Total, Page, XxxList }` envelope. */
export interface PageResult<T> {
  Total: number;
  Page: number;
  Items: T[];
}

export class Cin7CoreError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'Cin7CoreError';
  }
}

export abstract class BaseResource<TSchema extends z.ZodType> {
  constructor(
    protected readonly axios: AxiosInstance,
    /** Path relative to the v2 API root, e.g. `/sale`. */
    public readonly path: string,
    protected readonly schema: TSchema,
    protected readonly options: ResourceOptions = {}
  ) {}

  protected parse(payload: unknown): z.infer<TSchema> {
    if (this.options.validate === false) return payload as z.infer<TSchema>;
    return this.schema.parse(payload) as z.infer<TSchema>;
  }

  protected parseMany(payload: unknown): z.infer<TSchema>[] {
    if (!Array.isArray(payload)) return [];
    return payload.map((item) => this.parse(item));
  }

  protected unwrapPage(payload: unknown, listKey: string): PageResult<z.infer<TSchema>> {
    const data = (payload ?? {}) as Record<string, unknown>;
    const items = this.parseMany(data[listKey]);
    return {
      Total: typeof data.Total === 'number' ? data.Total : items.length,
      Page: typeof data.Page === 'number' ? data.Page : 1,
      Items: items
    };
  }
}

/**
 * A resource whose list endpoint returns `{ Total, Page, XxxList }` and whose detail
 * endpoint is addressed by `?ID=`.
 */
export class ReadableResource<TSchema extends z.ZodType> extends BaseResource<TSchema> {
  constructor(
    axios: AxiosInstance,
    path: string,
    schema: TSchema,
    /** Envelope key holding the collection, e.g. `SaleList`. */
    protected readonly listKey: string,
    options: ResourceOptions = {}
  ) {
    super(axios, path, schema, options);
  }

  /** Fetches a single record by id. */
  async get(id: string, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.get(this.path, { params: { ...params, ID: id } });
    // Some endpoints return the record directly; others wrap it in the list key with one item.
    const data = response.data;
    if (data && typeof data === 'object' && this.listKey in data && !('ID' in data)) {
      const page = this.unwrapPage(data, this.listKey);
      if (!page.Items.length) {
        throw new Cin7CoreError(`${this.path} returned no record for ID=${id}`, 404, data);
      }
      return page.Items[0];
    }
    return this.parse(data);
  }

  /** Fetches a single page. */
  async list(params: QueryOptions = {}): Promise<PageResult<z.infer<TSchema>>> {
    const response = await this.axios.get(this.path, { params });
    return this.unwrapPage(response.data, this.listKey);
  }

  /**
   * Walks pages until exhausted. Cin7 Core defaults to 100 rows and caps at 1000.
   */
  async *pages(params: QueryOptions = {}): AsyncGenerator<PageResult<z.infer<TSchema>>, void, void> {
    const Limit = params.Limit ?? MAX_LIMIT;
    let Page = params.Page ?? 1;

    while (true) {
      const result = await this.list({ ...params, Page, Limit });
      if (!result.Items.length) return;
      yield result;
      if (result.Items.length < Limit || Page * Limit >= result.Total) return;
      Page++;
    }
  }

  /** Collects every matching record by exhausting the list endpoint. */
  async listAll(params: QueryOptions = {}): Promise<z.infer<TSchema>[]> {
    const records: z.infer<TSchema>[] = [];
    for await (const page of this.pages(params)) records.push(...page.Items);
    return records;
  }

  /** Fetches every record modified at or after the given date (when the endpoint supports it). */
  async modifiedSince(since: Date | string, params: QueryOptions = {}) {
    const ModifiedSince = typeof since === 'string' ? since : since.toISOString();
    return this.listAll({ ...params, ModifiedSince });
  }
}

/** A readable resource that also supports create / update / delete. */
export class WritableResource<
  TSchema extends z.ZodType,
  TCreate = z.infer<TSchema>,
  TUpdate = z.infer<TSchema>
> extends ReadableResource<TSchema> {
  /** Creates a record. Cin7 Core returns the created object. */
  async create(record: TCreate, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.post(this.path, record, { params });
    return this.parse(response.data);
  }

  /** Updates a record. Cin7 Core returns the updated object. */
  async update(record: TUpdate, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.put(this.path, record, { params });
    return this.parse(response.data);
  }

  /** Deletes (or voids) a record. */
  async delete(id: string, params: QueryOptions = {}): Promise<unknown> {
    const response = await this.axios.delete(this.path, { params: { ...params, ID: id } });
    return response.data;
  }
}

/**
 * Nested document under a parent task (e.g. `/sale/order?SaleID=`).
 * These endpoints are addressed by the parent sale/purchase id, not their own.
 */
export class NestedDocumentResource<TSchema extends z.ZodType> extends BaseResource<TSchema> {
  constructor(
    axios: AxiosInstance,
    path: string,
    schema: TSchema,
    /** Query parameter naming the parent, usually `SaleID` or `TaskID`. */
    protected readonly parentKey: string,
    options: ResourceOptions = {}
  ) {
    super(axios, path, schema, options);
  }

  async get(parentId: string, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.get(this.path, {
      params: { ...params, [this.parentKey]: parentId }
    });
    return this.parse(response.data);
  }

  async create(body: unknown, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.post(this.path, body, { params });
    return this.parse(response.data);
  }

  async update(body: unknown, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.put(this.path, body, { params });
    return this.parse(response.data);
  }

  async delete(parentId: string, params: QueryOptions = {}): Promise<unknown> {
    const response = await this.axios.delete(this.path, {
      params: { ...params, [this.parentKey]: parentId }
    });
    return response.data;
  }
}
