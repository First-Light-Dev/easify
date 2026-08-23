/**
 * Field definitions — the translation layer between human labels and Pipedrive's hashed keys.
 *
 * Pipedrive stores custom field values under a 40-character hex `field_code`, so a payload
 * looks like `{ "d8f9...c1": "FARM-204" }` with nothing readable in it. Hardcoding those
 * hashes into a mapper is the standard way integrations against this API rot: the hash
 * differs per Pipedrive account, so the same code cannot run against a sandbox and
 * production, and nothing fails loudly when one is wrong — Pipedrive rejects the unknown key
 * and the value is simply never written.
 *
 * So mappers name fields by label and resolve them here, once, at runtime.
 *
 * The schema is cached because it changes rarely and every resolution would otherwise cost a
 * 20-token list read. `refresh()` clears it for the case that matters: a field added in the
 * Pipedrive UI while a long-lived process is running.
 */

import { PipedriveClientError, PipedriveNotFoundError } from '../errors/index';
import type { PipedriveHttpClient } from '../client/http-client';
import { MAX_PAGE_LIMIT } from '../types/common';
import type { PipedriveField, PipedriveFieldEntity } from '../types/fields';

const ENDPOINTS: Record<PipedriveFieldEntity, string> = {
  deal: 'dealFields',
  person: 'personFields',
  organization: 'organizationFields',
  product: 'productFields',
};

/** How long a fetched schema stays usable. Fields change rarely; a stale hash is silent. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  fields: PipedriveField[];
  fetchedAt: number;
}

export class PipedriveFields {
  private readonly cache = new Map<PipedriveFieldEntity, CacheEntry>();

  constructor(
    private readonly http: PipedriveHttpClient,
    private readonly ttlMs: number = DEFAULT_TTL_MS
  ) {}

  /** Every field defined for an entity, custom and built-in, straight from the API. */
  async list(entity: PipedriveFieldEntity): Promise<PipedriveField[]> {
    return this.http.listAll<PipedriveField>(
      ENDPOINTS[entity],
      { limit: MAX_PAGE_LIMIT },
      { operation: `list${cap(entity)}Fields` }
    );
  }

  /** As `list`, but served from cache when it is fresh. */
  async cached(entity: PipedriveFieldEntity): Promise<PipedriveField[]> {
    const hit = this.cache.get(entity);
    if (hit && Date.now() - hit.fetchedAt < this.ttlMs) return hit.fields;

    const fields = await this.list(entity);
    this.cache.set(entity, { fields, fetchedAt: Date.now() });
    return fields;
  }

  /** Drops the cache so the next read re-fetches. Call after adding a field in Pipedrive. */
  refresh(entity?: PipedriveFieldEntity): void {
    if (entity) this.cache.delete(entity);
    else this.cache.clear();
  }

  /** Only the custom fields — the ones with hashed codes. */
  async customFields(entity: PipedriveFieldEntity): Promise<PipedriveField[]> {
    return (await this.cached(entity)).filter((field) => field.is_custom_field);
  }

  /**
   * Resolves a field label to its `field_code`.
   *
   * Matching is case-insensitive and trims whitespace, because labels are typed by hand in
   * the Pipedrive UI and "Farm ID" / "farm id " are the same field to everyone but a strict
   * comparison.
   *
   * Throws on an ambiguous label rather than choosing. Pipedrive lets two fields share a
   * label, and picking one arbitrarily would write delivery instructions into whichever field
   * happened to sort first — a silent, per-account coin flip. A human has to rename one.
   */
  async codeFor(entity: PipedriveFieldEntity, label: string): Promise<string> {
    const wanted = label.trim().toLowerCase();
    const fields = await this.cached(entity);
    const matches = fields.filter((field) => field.field_name?.trim().toLowerCase() === wanted);

    if (matches.length > 1) {
      throw new PipedriveClientError({
        message:
          `"${label}" matches ${matches.length} ${entity} fields in Pipedrive ` +
          `(${matches.map((field) => field.field_code).join(', ')}). Rename one there, or ` +
          `address the field by its code directly.`,
        operation: `resolve${cap(entity)}Field`,
        recordId: label,
      });
    }

    if (!matches.length) {
      throw new PipedriveNotFoundError({
        message:
          `No ${entity} field labelled "${label}" exists in Pipedrive. Field labels are ` +
          `account-specific — check it exists, or call refresh() if it was just created.`,
        operation: `resolve${cap(entity)}Field`,
        recordId: label,
      });
    }

    return matches[0].field_code;
  }

  /** Resolves several labels at once. Fetches the schema once for the whole set. */
  async codesFor(
    entity: PipedriveFieldEntity,
    labels: string[]
  ): Promise<Record<string, string>> {
    await this.cached(entity);
    const out: Record<string, string> = {};
    for (const label of labels) out[label] = await this.codeFor(entity, label);
    return out;
  }

  /**
   * Turns a label-keyed object into the hash-keyed `custom_fields` payload Pipedrive expects.
   *
   * ```ts
   * custom_fields: await pipedrive.fields.encode('deal', {
   *   'Farm ID': 'FARM-204',
   *   'Delivery instructions': 'Leave at the north gate',
   * })
   * ```
   *
   * Undefined values are dropped; null is kept, because null is how a field is cleared.
   */
  async encode(
    entity: PipedriveFieldEntity,
    values: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const labels = Object.keys(values).filter((label) => values[label] !== undefined);
    const codes = await this.codesFor(entity, labels);

    const out: Record<string, unknown> = {};
    for (const label of labels) out[codes[label]] = values[label];
    return out;
  }

  /**
   * The reverse: turns a record's `custom_fields` back into a label-keyed object for logging
   * or mapping out of Pipedrive.
   *
   * Codes with no matching field definition are passed through unchanged rather than dropped
   * — losing a value silently is worse than an unreadable key.
   */
  async decode(
    entity: PipedriveFieldEntity,
    customFields: Record<string, unknown> | undefined | null
  ): Promise<Record<string, unknown>> {
    if (!customFields) return {};
    const fields = await this.cached(entity);
    const byCode = new Map(fields.map((field) => [field.field_code, field.field_name]));

    const out: Record<string, unknown> = {};
    for (const [code, value] of Object.entries(customFields)) {
      out[byCode.get(code) ?? code] = value;
    }
    return out;
  }

  /**
   * The option id behind an enum/set field's option label.
   *
   * Enum fields store an **option id**, not the label text. Writing the label lands as either
   * a rejected request or an unset field depending on the field type, so this exists to make
   * the right value easy to reach.
   */
  async optionId(
    entity: PipedriveFieldEntity,
    label: string,
    optionLabel: string
  ): Promise<number | string> {
    const code = await this.codeFor(entity, label);
    const fields = await this.cached(entity);
    const field = fields.find((candidate) => candidate.field_code === code);

    const wanted = optionLabel.trim().toLowerCase();
    const option = field?.options?.find((entry) => entry.label?.trim().toLowerCase() === wanted);

    if (!option) {
      const available = field?.options?.map((entry) => entry.label).join(', ') || 'none';
      throw new PipedriveNotFoundError({
        message:
          `"${optionLabel}" is not an option on the ${entity} field "${label}". ` +
          `Available options: ${available}.`,
        operation: `resolve${cap(entity)}FieldOption`,
        recordId: optionLabel,
      });
    }

    return option.id;
  }
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
