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

/**
 * Per-resource wiring, supplied by each resource when it constructs a sub-resource
 * rather than by the caller.
 */
export interface ResourceInit extends ResourceOptions {
  /**
   * Query parameter the **detail GET** is keyed by. Defaults to `ID`.
   *
   * Cin7 is not consistent here either: `/stockTransfer`, `/stockadjustment`,
   * `/stocktake`, `/inventoryWriteOff`, `/disassembly`, `/finishedGoods` and
   * `/journal` are read by `TaskID`, `/production/order` by `ProductionOrderID`
   * and `/ref/carrier` by `CarrierID`, while most endpoints use `ID`.
   *
   * Sending the wrong name is not a clean failure. Cin7 ignores unrecognised
   * query parameters, so `GET /stockTransfer?ID=<guid>` returns the *list*
   * envelope, `get()` unwraps it and hands back the first record in the account —
   * a different document than the one asked for.
   *
   * This applies to `get()` only. DELETE on the same resources really is keyed by
   * `ID` (`DELETE /stockTransfer?ID=&Void=`), so `delete()` deliberately does not
   * use this.
   */
  idParam?: string;
  /**
   * Query parameter this endpoint filters "changed since" on. Cin7 Core is not
   * consistent about the name, and most endpoints have no such filter at all:
   *
   * - `ModifiedSince` — `/customer`, `/product`, `/productFamily`, `/supplier`, `/crm/*`
   * - `UpdatedSince` — `/saleList`, `/purchaseList`, and both credit-note lists
   * - none — `/stockTransferList`, `/stockadjustmentList`, `/stockTakeList`,
   *   `/inventoryWriteOffList`, `/ref/*`
   *
   * Defaults to `null`, meaning unsupported, because Cin7 **silently ignores** an
   * unrecognised filter and returns every record rather than erroring. An endpoint has
   * to opt in by name, so an unverified one fails loudly instead of quietly turning an
   * incremental sync into a full table scan.
   */
  sinceParam?: string | null;
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

  /**
   * Turns Cin7's `{ Total, Page, XxxList }` into `{ Total, Page, Items }`.
   *
   * Throws when `listKey` is absent from the response. Cin7 always sends the key — an empty
   * page carries `[]`, verified against `/ref/account` past the last page — so its absence
   * means the key this resource was constructed with is wrong: a typo, or Cin7 renaming it.
   *
   * That case used to return `Items: []` while `Total` still came from the envelope, producing
   * a page claiming 230 records and carrying none. Every caller read it as "no records": a
   * poller would find no variances, a backfill no transfers, and nothing anywhere would error.
   * Silently returning zero rows is worse than failing, because zero is a plausible answer.
   */
  protected unwrapPage(payload: unknown, listKey: string): PageResult<z.infer<TSchema>> {
    const data = (payload ?? {}) as Record<string, unknown>;

    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new Cin7CoreError(
        `${this.path} returned ${Array.isArray(data) ? 'an array' : typeof data}, not the ` +
          `expected { Total, Page, ${listKey} } envelope.`,
        undefined,
        payload
      );
    }

    if (!(listKey in data)) {
      throw new Cin7CoreError(
        `${this.path} returned no "${listKey}" property, so this resource is reading the wrong ` +
          `envelope key and would report zero records for a page of ${String(data.Total ?? '?')}. ` +
          `Keys present: ${Object.keys(data).join(', ') || '(none)'}.`,
        undefined,
        payload
      );
    }

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
  /** See `ResourceInit.idParam`. Applies to `get()`, not `delete()`. */
  protected readonly idParam: string;

  /** See `ResourceInit.sinceParam`. `null` means this endpoint has no such filter. */
  protected readonly sinceParam: string | null;

  constructor(
    axios: AxiosInstance,
    path: string,
    schema: TSchema,
    /** Envelope key holding the collection, e.g. `SaleList`. */
    protected readonly listKey: string,
    options: ResourceInit = {}
  ) {
    super(axios, path, schema, options);
    this.idParam = options.idParam ?? 'ID';
    this.sinceParam = options.sinceParam ?? null;
  }

  /** Fetches a single record by id, keyed by this endpoint's `idParam`. */
  async get(id: string, params: QueryOptions = {}): Promise<z.infer<TSchema>> {
    const response = await this.axios.get(this.path, {
      params: { ...params, [this.idParam]: id }
    });
    // Some endpoints return the record directly; others wrap it in the list key with one item.
    const data = response.data;
    if (data && typeof data === 'object' && this.listKey in data && !('ID' in data)) {
      const page = this.unwrapPage(data, this.listKey);
      if (!page.Items.length) {
        throw new Cin7CoreError(
          `${this.path} returned no record for ${this.idParam}=${id}`,
          404,
          data
        );
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

  /**
   * Fetches every record changed at or after the given date, using whichever filter name
   * this endpoint actually accepts (see `ResourceInit.sinceParam`).
   *
   * Throws when the endpoint has no such filter. That is deliberate: Cin7 ignores an
   * unrecognised query parameter and returns the full collection, so guessing the name
   * turns an incremental sync into a silent full scan.
   */
  async changedSince(since: Date | string, params: QueryOptions = {}) {
    if (!this.sinceParam) {
      throw new Cin7CoreError(
        `${this.path} has no "changed since" filter — Cin7 would ignore it and return ` +
          `every record. Page through list() / listAll() and filter on LastModifiedOn instead.`
      );
    }
    const value = typeof since === 'string' ? since : since.toISOString();
    return this.listAll({ ...params, [this.sinceParam]: value });
  }

  /** @deprecated Renamed to `changedSince`, which sends the filter name Cin7 expects. */
  async modifiedSince(since: Date | string, params: QueryOptions = {}) {
    return this.changedSince(since, params);
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

  /**
   * Deletes (or voids) a record.
   *
   * Keyed by `ID` regardless of `idParam`, and that is not an oversight: Cin7
   * uses different names for the two verbs on the same resource — `GET
   * /stockTransfer?TaskID=` but `DELETE /stockTransfer?ID=&Void=`. Same for
   * `/stockadjustment` and `/stocktake`.
   */
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
