/**
 * Field-definition shapes — the schema behind Pipedrive's hashed custom field keys.
 *
 * Note the v2 naming, which differs from v1 and from nearly every blog post about this API:
 * v2 returns **`field_code`** and **`field_name`** where v1 returned `key` and `name`. The
 * value in a record's `custom_fields` map is keyed by `field_code`.
 */

/** Pipedrive's field type discriminator. Determines the shape of the stored value. */
export type PipedriveFieldType =
  | 'varchar'
  | 'varchar_auto'
  | 'text'
  | 'double'
  | 'monetary'
  | 'date'
  | 'daterange'
  | 'time'
  | 'timerange'
  | 'set'
  | 'enum'
  | 'user'
  | 'org'
  | 'people'
  | 'phone'
  | 'address'
  | 'varchar_options'
  | string;

export interface PipedriveFieldOption {
  id: number | string;
  label?: string;
  color?: string | null;
}

export interface PipedriveField {
  /** The hashed key — a 40-character hex string for custom fields, a plain name for built-ins. */
  field_code: string;
  /** The human label shown in the Pipedrive UI. */
  field_name?: string;
  description?: string | null;
  field_type?: PipedriveFieldType;
  /** Populated for `enum` and `set` fields. Writing one means writing an option **id**. */
  options?: PipedriveFieldOption[];
  subfields?: Array<{ field_code?: string; field_name?: string; field_type?: string }>;
  is_custom_field?: boolean;
  [key: string]: unknown;
}

/** Which entity's field schema to read. */
export type PipedriveFieldEntity = 'deal' | 'person' | 'organization' | 'product';
