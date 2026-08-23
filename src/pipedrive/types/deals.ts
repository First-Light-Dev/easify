/**
 * Deal shapes, as API v2 returns and accepts them.
 *
 * The field that matters most to an order integration is `status`. Pipedrive has no separate
 * "closed" state: a deal is `open`, `won`, `lost` or `deleted`, and "won" is the only signal
 * that a sale has actually happened.
 */

import type { PipedriveCustomFields, PipedriveSyncOptions } from './common';

/** `deleted` appears in reads but cannot be set directly — delete the deal instead. */
export type PipedriveDealStatus = 'open' | 'won' | 'lost' | 'deleted';

export interface PipedriveDeal {
  id: number;
  title?: string;
  owner_id?: number | null;
  person_id?: number | null;
  org_id?: number | null;
  pipeline_id?: number | null;
  stage_id?: number | null;
  value?: number | null;
  currency?: string | null;
  add_time?: string;
  update_time?: string;
  stage_change_time?: string | null;
  is_deleted?: boolean;
  is_archived?: boolean;
  status?: PipedriveDealStatus;
  probability?: number | null;
  lost_reason?: string | null;
  visible_to?: number | null;
  close_time?: string | null;
  /** Set when the deal was marked won. The timestamp an order integration keys off. */
  won_time?: string | null;
  lost_time?: string | null;
  expected_close_date?: string | null;
  label_ids?: number[];
  origin?: string | null;
  origin_id?: string | null;
  channel?: number | null;
  channel_id?: string | null;
  /** Keyed by hashed `field_code`, and only populated when `custom_fields` was requested. */
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveDealInput {
  title?: string;
  owner_id?: number;
  person_id?: number;
  org_id?: number;
  pipeline_id?: number;
  stage_id?: number;
  value?: number;
  currency?: string;
  status?: Exclude<PipedriveDealStatus, 'deleted'>;
  probability?: number;
  lost_reason?: string;
  visible_to?: number;
  close_time?: string;
  won_time?: string;
  lost_time?: string;
  expected_close_date?: string;
  label_ids?: number[];
  is_archived?: boolean;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveDealListOptions extends PipedriveSyncOptions {
  filter_id?: number;
  ids?: string;
  owner_id?: number;
  person_id?: number;
  org_id?: number;
  pipeline_id?: number;
  stage_id?: number;
  status?: PipedriveDealStatus;
  include_fields?: string;
}

/** A product attached to a deal. `product_id` is the catalogue product; `id` is the attachment. */
export interface PipedriveDealProduct {
  id?: number;
  deal_id?: number;
  product_id?: number;
  name?: string;
  /** The catalogue SKU, when the endpoint is asked to include product data. */
  product_variation_id?: number | null;
  item_price?: number;
  quantity?: number;
  discount?: number;
  discount_type?: 'percentage' | 'amount';
  tax?: number;
  tax_method?: string | null;
  comments?: string | null;
  is_enabled?: boolean;
  sum?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface PipedriveDealProductInput {
  product_id: number;
  item_price: number;
  quantity: number;
  tax?: number;
  comments?: string;
  discount?: number;
  discount_type?: 'percentage' | 'amount';
  is_enabled?: boolean;
  tax_method?: string;
  product_variation_id?: number;
  [key: string]: unknown;
}
