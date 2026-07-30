import { AxiosInstance } from 'axios';
import { z } from 'zod';
import {
  DeleteResult,
  DeleteResultSchema,
  UpsertResult,
  UpsertResultSchema
} from '../types/Common';

/**
 * The filtering, ordering and paging parameters accepted by every Cin7 Omni list endpoint.
 * See https://api.cin7.com/api/Help for the full `where` clause grammar.
 */
export interface QueryOptions {
  /** Comma separated list of fields to return, e.g. `id,reference,lineItems(code)`. */
  fields?: string;
  /** Filter clause, e.g. `modifiedDate>='2020-12-31T00:00:00Z'`. */
  where?: string;
  /** Comma separated ordering, e.g. `createdDate ASC`. */
  order?: string;
  /** 1-based page number. */
  page?: number;
  /** Rows per page. Defaults to 50 and caps at 250. */
  rows?: number;
}

export interface ResourceOptions {
  /** Parses responses with the generated schemas. Defaults to true. */
  validate?: boolean;
}

/** The largest page size the API accepts. */
export const MAX_ROWS = 250;

/** Quotes a value for use as a string literal inside a `where` clause. */
export function whereValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Thrown when Cin7 reports that one or more records in a batch failed to save. */
export class Cin7OmniUpsertError extends Error {
  constructor(message: string, public readonly results: UpsertResult[]) {
    super(message);
    this.name = 'Cin7OmniUpsertError';
  }
}

function describeFailures(results: UpsertResult[]): string {
  return results
    .filter((result) => !result.success)
    .map(
      (result) => `[${result.index ?? 0}] ${(result.errors ?? []).join(', ') || 'Unknown error'}`
    )
    .join('; ');
}

export abstract class BaseResource<TSchema extends z.ZodType> {
  constructor(
    protected readonly axios: AxiosInstance,
    /** Path relative to the API root, e.g. `/v1/SalesOrders`. */
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

  protected parseUpsertResults(payload: unknown): UpsertResult[] {
    if (!Array.isArray(payload)) return [];
    return payload.map((item) => UpsertResultSchema.parse(item));
  }

  /** Sends a single record and throws unless Cin7 reports it as saved. */
  protected async upsertOne(
    method: 'post' | 'put',
    records: unknown[],
    params?: Record<string, unknown>
  ): Promise<UpsertResult> {
    const results = await this.upsertMany(method, records, params);
    const failures = results.filter((result) => !result.success);

    if (failures.length || !results.length) {
      throw new Cin7OmniUpsertError(
        `Cin7 rejected the ${method === 'post' ? 'create' : 'update'} of ${this.path}: ${
          describeFailures(results) || 'no result returned'
        }`,
        results
      );
    }
    return results[0];
  }

  protected async upsertMany(
    method: 'post' | 'put',
    records: unknown[],
    params?: Record<string, unknown>
  ): Promise<UpsertResult[]> {
    const response = await this.axios.request({
      method,
      url: this.path,
      data: records,
      params
    });
    return this.parseUpsertResults(response.data);
  }
}

/** A resource exposing the read side of the API: `GET /{id}` and the list endpoint. */
export class ReadableResource<TSchema extends z.ZodType> extends BaseResource<TSchema> {
  /** Fetches a single record by its Cin7 id. */
  async get(id: number | string): Promise<z.infer<TSchema>> {
    const response = await this.axios.get(`${this.path}/${id}`);
    return this.parse(response.data);
  }

  /** Fetches a single page of records. */
  async list(options: QueryOptions = {}): Promise<z.infer<TSchema>[]> {
    const response = await this.axios.get(this.path, { params: options });
    return this.parseMany(response.data);
  }

  /** Convenience wrapper around `list` for the common case of filtering. */
  async where(clause: string, options: Omit<QueryOptions, 'where'> = {}) {
    return this.list({ ...options, where: clause });
  }

  /**
   * Walks the list endpoint page by page until it returns an empty page, yielding one page
   * at a time so large result sets do not have to be held in memory at once.
   */
  async *pages(options: QueryOptions = {}): AsyncGenerator<z.infer<TSchema>[], void, void> {
    const rows = options.rows ?? MAX_ROWS;
    let page = options.page ?? 1;

    while (true) {
      const results = await this.list({ ...options, page, rows });
      if (!results.length) return;

      yield results;
      if (results.length < rows) return;
      page++;
    }
  }

  /** Collects every matching record by exhausting the list endpoint. */
  async listAll(options: QueryOptions = {}): Promise<z.infer<TSchema>[]> {
    const records: z.infer<TSchema>[] = [];
    for await (const page of this.pages(options)) records.push(...page);
    return records;
  }

  /** Fetches every record modified at or after the given date. */
  async modifiedSince(since: Date | string, options: QueryOptions = {}) {
    const timestamp = typeof since === 'string' ? since : since.toISOString();
    return this.listAll({ ...options, where: `modifiedDate>='${timestamp}'` });
  }

  /** Fetches every record created at or after the given date. */
  async createdSince(since: Date | string, options: QueryOptions = {}) {
    const timestamp = typeof since === 'string' ? since : since.toISOString();
    return this.listAll({ ...options, where: `createdDate>='${timestamp}'` });
  }

  protected async deleteRecord(id: number | string): Promise<DeleteResult> {
    const response = await this.axios.delete(`${this.path}/${id}`);
    return DeleteResultSchema.parse(response.data);
  }
}

/** A resource that additionally supports the batch create and update endpoints. */
export class WritableResource<
  TSchema extends z.ZodType,
  TCreateSchema extends z.ZodType,
  TUpdateSchema extends z.ZodType
> extends ReadableResource<TSchema> {
  constructor(
    axios: AxiosInstance,
    path: string,
    schema: TSchema,
    protected readonly createSchema: TCreateSchema,
    protected readonly updateSchema: TUpdateSchema,
    options: ResourceOptions = {}
  ) {
    super(axios, path, schema, options);
  }

  protected validateInput<T extends z.ZodType>(schema: T, records: unknown[]): unknown[] {
    if (this.options.validate === false) return records;
    return records.map((record) => schema.parse(record));
  }

  /** Creates one record, throwing if Cin7 reports a failure. */
  async create(
    record: z.infer<TCreateSchema>,
    params?: Record<string, unknown>
  ): Promise<UpsertResult> {
    return this.upsertOne('post', this.validateInput(this.createSchema, [record]), params);
  }

  /** Creates a batch of records and returns the per-record results without throwing. */
  async createMany(
    records: z.infer<TCreateSchema>[],
    params?: Record<string, unknown>
  ): Promise<UpsertResult[]> {
    return this.upsertMany('post', this.validateInput(this.createSchema, records), params);
  }

  /** Updates one record, throwing if Cin7 reports a failure. */
  async update(
    record: z.infer<TUpdateSchema>,
    params?: Record<string, unknown>
  ): Promise<UpsertResult> {
    return this.upsertOne('put', this.validateInput(this.updateSchema, [record]), params);
  }

  /** Updates a batch of records and returns the per-record results without throwing. */
  async updateMany(
    records: z.infer<TUpdateSchema>[],
    params?: Record<string, unknown>
  ): Promise<UpsertResult[]> {
    return this.upsertMany('put', this.validateInput(this.updateSchema, records), params);
  }
}
