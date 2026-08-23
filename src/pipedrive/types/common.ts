/**
 * Shapes shared across every Pipedrive resource.
 *
 * Three things here are easy to get wrong and are handled once, centrally:
 *
 * - **Every response is enveloped** as `{ success, data, additional_data }`. Callers want
 *   `data`; the client unwraps it so no resource repeats that.
 * - **Paging is cursor-based, not offset-based.** `additional_data.next_cursor` is an opaque
 *   string, and its *absence* is the end of the collection — not an empty page.
 * - **Custom fields are hashed keys**, not labels. `custom_fields` is keyed by a 40-character
 *   hex `field_code`, so nothing readable appears in the payload. See `PipedriveFields`.
 */

/** The envelope every Pipedrive endpoint wraps its payload in. */
export interface PipedriveEnvelope<T> {
  success: boolean;
  data: T;
  additional_data?: PipedriveAdditionalData;
  /** Present on failures. Pipedrive is not consistent about which of these it sets. */
  error?: string;
  error_info?: string;
}

export interface PipedriveAdditionalData {
  /**
   * Opaque marker for the first item of the next page.
   *
   * Absent or null on the last page. Never construct or parse one — Pipedrive does not
   * guarantee its format, and an offset guessed from a row count will silently skip records
   * when the collection changes mid-walk.
   */
  next_cursor?: string | null;
}

/** Cursor paging parameters accepted by every v2 list endpoint. */
export interface PipedriveListOptions {
  /**
   * Rows per page. Defaults to 100 server-side and caps at 500.
   *
   * Worth setting to `MAX_PAGE_LIMIT` for backfills: a list read costs about 20 tokens
   * regardless of how many rows come back, so fewer, larger pages spend far less budget.
   */
  limit?: number;
  /** Opaque marker from the previous page's `next_cursor`. */
  cursor?: string;
  /** `id`, `update_time` or `add_time`. */
  sort_by?: 'id' | 'update_time' | 'add_time';
  sort_direction?: 'asc' | 'desc';
  /**
   * Comma-separated custom field codes to include.
   *
   * Only meaningful on `persons`, `organizations` and `deals`, where omitting it returns
   * `custom_fields` unpopulated.
   */
  custom_fields?: string;
  [key: string]: unknown;
}

/** List options plus the incremental-sync window every poller uses. */
export interface PipedriveSyncOptions extends PipedriveListOptions {
  /**
   * Only records whose `update_time` is at or after this moment.
   *
   * Format is `YYYY-MM-DD HH:MM:SS` in UTC — **not** ISO-8601. `toPipedriveTime` converts a
   * `Date`, and the resources call it for you.
   *
   * The bound is inclusive, so a cursor stored from the last record's `update_time` returns
   * that record again on the next run. That is the safe direction to err, and why writes
   * driven by these reads must be idempotent.
   */
  updated_since?: string | Date;
  /** Exclusive upper bound, same format. */
  updated_until?: string | Date;
}

/** The largest page Pipedrive accepts. */
export const MAX_PAGE_LIMIT = 500;

/**
 * Formats a moment the way Pipedrive's `updated_since` expects: `YYYY-MM-DD HH:MM:SS`, UTC.
 *
 * Passing a bare ISO-8601 string is the trap this exists to close — Pipedrive answers 200 with
 * the filter silently ignored, so a poller returns the entire collection every tick and looks
 * like it is working.
 */
export function toPipedriveTime(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/** A postal address, as persons and organizations both return it. */
export interface PipedriveAddress {
  value?: string | null;
  country?: string | null;
  admin_area_level_1?: string | null;
  admin_area_level_2?: string | null;
  locality?: string | null;
  sublocality?: string | null;
  route?: string | null;
  street_number?: string | null;
  subpremise?: string | null;
  postal_code?: string | null;
  [key: string]: unknown;
}

/** One entry of a person's `emails`, `phones` or `im` array. */
export interface PipedriveContactPoint {
  value?: string | null;
  primary?: boolean;
  label?: string | null;
}

/**
 * Custom field values, keyed by `field_code` — a 40-character hex hash, not a label.
 *
 * The value's type follows the field's `field_type`: a string for text, a number for numeric,
 * an option id for enums, and `{ value, currency }` for monetary fields.
 */
export type PipedriveCustomFields = Record<string, unknown>;

/** Picks the primary entry out of an `emails`/`phones` array, falling back to the first. */
export function primaryValue(points?: PipedriveContactPoint[] | null): string | undefined {
  if (!points?.length) return undefined;
  const primary = points.find((point) => point.primary && point.value);
  return (primary ?? points.find((point) => point.value))?.value ?? undefined;
}
