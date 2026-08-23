/**
 * Product shapes, as API v2 returns and accepts them.
 *
 * `code` is Pipedrive's SKU field and the natural join key to an inventory system. It is
 * **not** enforced unique by Pipedrive, so a catalogue sync has to treat duplicates as a data
 * problem rather than assuming a lookup returns one row.
 *
 * Pricing is an array, one entry per currency — there is no scalar price. A product with no
 * price in the currency you are selling in returns an empty `prices` array rather than zero.
 */

import type { PipedriveCustomFields, PipedriveSyncOptions } from './common';

export interface PipedriveProductPrice {
  product_id?: number;
  price?: number;
  currency?: string;
  cost?: number | null;
  direct_cost?: number | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface PipedriveProduct {
  id: number;
  name?: string;
  /** The SKU. Not unique-enforced by Pipedrive. */
  code?: string | null;
  unit?: string | null;
  tax?: number;
  is_deleted?: boolean;
  is_linkable?: boolean;
  visible_to?: number | null;
  owner_id?: number | null;
  add_time?: string;
  update_time?: string;
  description?: string | null;
  category?: string | null;
  prices?: PipedriveProductPrice[];
  billing_frequency?: string | null;
  billing_frequency_cycles?: number | null;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveProductInput {
  name?: string;
  code?: string;
  description?: string;
  unit?: string;
  tax?: number;
  category?: number;
  owner_id?: number;
  is_linkable?: boolean;
  visible_to?: number;
  prices?: PipedriveProductPrice[];
  billing_frequency?: string;
  billing_frequency_cycles?: number;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveProductListOptions extends PipedriveSyncOptions {
  owner_id?: number;
  ids?: string;
  filter_id?: number;
}
