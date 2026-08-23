/**
 * Organization shapes, as API v2 returns and accepts them.
 *
 * For a B2B integration the organization is usually the customer of record — the thing a
 * Cin7 contact maps to — with persons hanging off it as individual contacts.
 */

import type { PipedriveAddress, PipedriveCustomFields, PipedriveSyncOptions } from './common';

export interface PipedriveOrganization {
  id: number;
  name?: string;
  owner_id?: number | null;
  add_time?: string;
  update_time?: string;
  is_deleted?: boolean;
  visible_to?: number | null;
  address?: PipedriveAddress | null;
  label_ids?: number[];
  website?: string | null;
  linkedin?: string | null;
  industry?: number | null;
  annual_revenue?: number | null;
  employee_count?: number | null;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveOrganizationInput {
  name?: string;
  owner_id?: number;
  visible_to?: number;
  label_ids?: number[];
  address?: PipedriveAddress;
  website?: string;
  linkedin?: string;
  industry?: number;
  annual_revenue?: number;
  employee_count?: number;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedriveOrganizationListOptions extends PipedriveSyncOptions {
  filter_id?: number;
  ids?: string;
  owner_id?: number;
  include_fields?: string;
}
