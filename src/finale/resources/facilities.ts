/**
 * Finale facilities — the warehouses stock sits in.
 *
 * Setup rather than steady state: a caller maps each of its own location names to a facility URL,
 * and those URLs have to come from somewhere. Listing them is how an operator fills that map
 * in without reading ids out of the Finale UI's address bar.
 *
 * `findByName` is for verifying config, not for the hot path. Resolving a facility by name on
 * every order create would spend a request looking up something that never changes — and
 * against a 300-collection-reads-per-hour budget that is a real cost.
 *
 * Note Finale distinguishes facilities from **sublocations**, and an order's origin and
 * destination "cannot be a sublocation". So a facility that looks right in the UI may be
 * rejected on an order, so only top-level facilities can be used as an order's origin
 * or destination.
 */

import type { FinaleHttpClient } from '../client/http-client';

/** A warehouse or location in Finale. */
export interface FinaleFacility {
  facilityUrl?: string;
  facilityId?: string;
  facilityName?: string;
  /** Set on sublocations. Orders reject these, so only top-level facilities can be used. */
  parentFacilityUrl?: string;
  [key: string]: unknown;
}

export class FinaleFacilities {
  constructor(private readonly http: FinaleHttpClient) {}

  /**
   * Every facility.
   *
   * Unfiltered on purpose: a facility list is small and static, so paging it by
   * `lastUpdatedDate` would add complexity for nothing. If an account ever has enough
   * facilities to hit a limit, that assumption needs revisiting.
   */
  async list(limit = 1000): Promise<FinaleFacility[]> {
    return this.http.getCollection<FinaleFacility>('facility', { limit }, {
      operation: 'listFinaleFacilities',
    });
  }

  /**
   * A facility by name, or null.
   *
   * Trimmed, case-insensitive comparison: a name typed into two different UIs should not
   * fail to match over a trailing space.
   */
  async findByName(name: string): Promise<FinaleFacility | null> {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return null;

    const facilities = await this.list();
    return (
      facilities.find((f) => (f.facilityName ?? '').trim().toLowerCase() === wanted) ?? null
    );
  }
}
