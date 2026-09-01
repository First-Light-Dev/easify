/**
 * Shared Finale primitives: record URLs, the column-major response transposer, and the
 * base64 filter encoder.
 *
 * Three things about Finale's API shape the whole package, and all three were confirmed
 * against the current docs at developer.finaleinventory.com:
 *
 * 1. **Records are addressed by URL path**, not bare id:
 *    `/[account]/api/[collection]/[id]`, e.g. `/newcentury/api/product/NCP-002`.
 *
 * 2. **Collections come back COLUMN-MAJOR.** Not an array of objects — an object of
 *    parallel arrays, where index i across every key forms record i:
 *
 *        { "productId":  ["NCP-002", "NCP-018"],
 *          "productUrl": ["/acct/api/product/NCP-002", "/acct/api/product/NCP-018"] }
 *
 *    This is the single easiest thing to get wrong about Finale. Code that assumes an
 *    array of objects does not error — it silently finds zero records, so a poller looks
 *    healthy while syncing nothing. `transposeCollection` converts it.
 *
 * 3. **Filtering is a base64-encoded JSON object** in a `filter` query parameter, whose
 *    values are `[lowerBound, upperBound]` closed ranges. Not plain query params.
 */

/**
 * A Finale record reference, e.g. `/newcentury/api/order/100045`.
 *
 * Branded rather than a bare `string` so a numeric id cannot be passed where a URL is
 * required — the compiler catches what would otherwise reach Finale as a rejected or
 * silently-ignored field.
 */
export type FinaleUrl = string & { readonly __finaleUrl: unique symbol };

/** Asserts a string is URL-shaped and brands it. */
export function asFinaleUrl(value: string): FinaleUrl {
  if (!value.startsWith('/')) {
    throw new TypeError(
      `Finale references records by URL path, not bare id — expected something like ` +
        `"/account/api/order/100045", received "${value}"`
    );
  }
  return value as FinaleUrl;
}

/**
 * Builds a record URL from its parts.
 *
 * Safe for most collections, but **not for products**: Finale's docs warn that "Finale
 * uses a different internal identifier than the external resource id for some resources.
 * This is especially true on the product resource collection." So never construct a
 * product URL — read it from `productUrl` on a fetched record. `FinaleProducts.resolveUrl`
 * exists for exactly that reason.
 */
export function finaleUrl(accountPath: string, resource: string, id: string | number): FinaleUrl {
  return asFinaleUrl(`/${accountPath}/api/${resource}/${id}`);
}

/**
 * The trailing id from a Finale URL.
 *
 * Needed constantly: the host keys its correlation records by bare id (a URL contains
 * slashes and cannot be a Firestore document id), while Finale payloads carry full URLs.
 */
export function finaleIdFromUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const id = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  if (!id) throw new TypeError(`Could not extract an id from Finale url "${url}"`);
  return id;
}

/**
 * Converts a column-major Finale collection into an array of records.
 *
 * Finale returns `{ field: [v0, v1, ...], other: [w0, w1, ...] }`. This produces
 * `[{ field: v0, other: w0 }, { field: v1, other: w1 }]`.
 *
 * Row count is the **longest** array present, not the shortest. Finale omits or truncates
 * some columns (action URLs appear only when valid for a record's current state), and
 * taking the shortest would silently drop whole records because one optional column was
 * absent. Missing cells become `undefined`, which the loose record types already allow.
 *
 * Non-array values are treated as scalars repeated across every row — a single-record GET
 * returns scalars rather than arrays, so this makes both shapes flow through one path.
 */
export function transposeCollection<T>(raw: unknown): T[] {
  if (raw === null || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw as T[];

  const bag = raw as Record<string, unknown>;
  const keys = Object.keys(bag);
  if (keys.length === 0) return [];

  const arrayKeys = keys.filter((key) => Array.isArray(bag[key]));

  // No array-valued keys at all: this is a single record, not a collection.
  if (arrayKeys.length === 0) return [bag as T];

  const rowCount = Math.max(...arrayKeys.map((key) => (bag[key] as unknown[]).length));
  if (rowCount === 0) return [];

  const rows: T[] = [];
  for (let index = 0; index < rowCount; index++) {
    const row: Record<string, unknown> = {};
    for (const key of keys) {
      const value = bag[key];
      row[key] = Array.isArray(value) ? value[index] : value;
    }
    rows.push(row as T);
  }
  return rows;
}

/**
 * A page of results.
 *
 * Finale has **no offset parameter**. Paging is `limit` plus a moving `lastUpdatedDate`
 * lower bound: take the newest timestamp from the page you got and use it as the next
 * page's lower bound. Filters are inclusive, so consecutive pages overlap by design —
 * which is why the host deduplicates on a stable event id rather than assuming each
 * record is seen once.
 */
export interface FinalePage<T> {
  items: T[];
  limit: number;
  /** True when the page came back full, so another may exist. */
  hasMore: boolean;
  /**
   * Newest `lastUpdatedDate` in this page — pass as the next request's `changedSince`.
   * Undefined when the page is empty or carries no timestamps.
   */
  nextChangedSince?: string;
}

/** Finale's hard ceiling on a `lastUpdatedDate` filter range. Wider requests 400. */
export const MAX_FILTER_RANGE_DAYS = 30;

export interface FinaleListOptions {
  /**
   * Rows Finale SCANS, not rows returned.
   *
   * Finale applies this before filtering: it reads the first `limit` rows of the range —
   * oldest first — and only then matches the filter. So a small limit over a dense range can
   * return nothing while matching records sit further in. Raise it for a wide window; in
   * steady state, where the range spans minutes, the default is ample.
   */
  limit?: number;
  /**
   * Lower bound for `lastUpdatedDate`.
   *
   * Finale **requires a closed range** — an unbounded upper bound returns 400 — so the
   * client supplies the upper bound itself. The range may not exceed 30 days.
   */
  changedSince?: Date | string;
  /** Upper bound. Defaults to now. */
  changedUntil?: Date | string;
}

/** Finale's wire format for dates. */
export function toFinaleDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Builds the base64-encoded `filter` query parameter.
 *
 * Finale expects base64 of a JSON object whose every value is a `[lower, upper]` closed
 * range. An exact match is expressed as the same value twice — `statusId:
 * ['ORDER_COMPLETED','ORDER_COMPLETED']` — which is why scalars are widened here rather
 * than passed through.
 *
 * Throws when a date range exceeds 30 days, because Finale answers that with a 400 whose
 * message does not say why. Failing locally with an explanation is strictly better than
 * relaying an opaque rejection from a queue worker.
 */
export function encodeFilter(criteria: Record<string, unknown>): string {
  const filter: Record<string, [unknown, unknown]> = {};

  for (const [field, value] of Object.entries(criteria)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length !== 2) {
        throw new TypeError(
          `Finale filter "${field}" must be a [lowerBound, upperBound] pair, received ` +
            `${value.length} values. An exact match is the same value twice.`
        );
      }
      filter[field] = [value[0], value[1]];
    } else {
      filter[field] = [value, value];
    }
  }

  const dateRange = filter.lastUpdatedDate;
  if (dateRange) assertRangeWithinLimit(dateRange);

  return Buffer.from(JSON.stringify(filter), 'utf8').toString('base64');
}

function assertRangeWithinLimit(range: [unknown, unknown]): void {
  const [lower, upper] = range;
  if (typeof lower !== 'string' || typeof upper !== 'string') return;

  const from = Date.parse(lower);
  const to = Date.parse(upper);
  if (Number.isNaN(from) || Number.isNaN(to)) return;

  const days = (to - from) / 86_400_000;
  if (days > MAX_FILTER_RANGE_DAYS) {
    throw new TypeError(
      `Finale rejects a lastUpdatedDate range wider than ${MAX_FILTER_RANGE_DAYS} days ` +
        `(requested ${days.toFixed(1)}). Narrow the window and page forward using each ` +
        `page's nextChangedSince.`
    );
  }
}

/**
 * Clamps a requested range to Finale's 30-day limit.
 *
 * Used on the first poll after an outage, where a watermark may be months old. Clamping
 * and paging forward gets there; sending the whole span just 400s.
 */
export function clampRange(
  changedSince: Date | string,
  changedUntil: Date | string = new Date()
): { from: string; to: string; clamped: boolean } {
  const from = new Date(toFinaleDate(changedSince));
  const requestedTo = new Date(toFinaleDate(changedUntil));
  const maxTo = new Date(from.getTime() + MAX_FILTER_RANGE_DAYS * 86_400_000);

  const clamped = requestedTo > maxTo;
  return {
    from: from.toISOString(),
    to: (clamped ? maxTo : requestedTo).toISOString(),
    clamped,
  };
}
