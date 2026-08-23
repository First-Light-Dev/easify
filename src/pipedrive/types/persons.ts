/**
 * Person shapes, as API v2 returns and accepts them.
 *
 * Emails and phones are **arrays of labelled entries**, not scalars — a person legitimately
 * has several. `primaryValue` in `./common` picks the right one; taking `emails[0].value`
 * works until the day someone reorders them in the UI.
 */

import type {
  PipedriveAddress,
  PipedriveContactPoint,
  PipedriveCustomFields,
  PipedriveSyncOptions,
} from './common';

export interface PipedrivePerson {
  id: number;
  name?: string;
  first_name?: string | null;
  last_name?: string | null;
  owner_id?: number | null;
  org_id?: number | null;
  add_time?: string;
  update_time?: string;
  emails?: PipedriveContactPoint[];
  phones?: PipedriveContactPoint[];
  im?: PipedriveContactPoint[];
  is_deleted?: boolean;
  visible_to?: number | null;
  label_ids?: number[];
  picture_id?: number | null;
  postal_address?: PipedriveAddress | null;
  notes?: string | null;
  birthday?: string | null;
  job_title?: string | null;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedrivePersonInput {
  name?: string;
  owner_id?: number;
  org_id?: number;
  emails?: PipedriveContactPoint[];
  phones?: PipedriveContactPoint[];
  im?: PipedriveContactPoint[];
  visible_to?: number;
  label_ids?: number[];
  postal_address?: PipedriveAddress;
  notes?: string;
  birthday?: string;
  job_title?: string;
  marketing_status?: string;
  custom_fields?: PipedriveCustomFields;
  [key: string]: unknown;
}

export interface PipedrivePersonListOptions extends PipedriveSyncOptions {
  filter_id?: number;
  ids?: string;
  owner_id?: number;
  org_id?: number;
  deal_id?: number;
  include_fields?: string;
}
