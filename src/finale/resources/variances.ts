/**
 * Finale inventory variances — what a physical count found that the system did not expect.
 *
 * `GET /inventoryvariance` returns column-major arrays filtered by the base64 `filter`
 * parameter, and includes `inventoryItemVarianceList` on the collection read — so unlike
 * orders, the lines arrive without a per-record follow-up fetch.
 *
 * This module reads and nothing more. Whether a variance is a routine adjustment or a
 * write-off is a business decision for the caller: `physicalInventoryTypeId` carries Finale's
 * own classification where it is set, and `generalComments` holds whatever the counter typed.
 */

import type { FinaleHttpClient } from '../client/http-client';
import { clampRange, encodeFilter, type FinaleListOptions, type FinalePage } from '../types/common';
import type { FinaleVariance, FinaleVarianceQuery } from '../types/variances';

export class FinaleVariances {
  constructor(private readonly http: FinaleHttpClient) {}

  /** One variance by its Finale id. */
  async get(varianceId: string): Promise<FinaleVariance> {
    return this.http.get<FinaleVariance>(
      `inventoryvariance/${encodeURIComponent(varianceId)}`,
      undefined,
      { operation: 'getFinaleVariance', recordId: varianceId }
    );
  }

  /**
   * One page of variances changed in a window.
   *
   * `changedSince` is required: Finale needs a closed `lastUpdatedDate` range, caps it at
   * 30 days, and requires filtering once a collection passes 120K entities.
   *
   * The caller should restrict to committed variances via `query.statusId`. An in-progress
   * count is not a fact — acting on one corrects stock that is still being counted,
   * then posts another when the count finishes. The exact "committed" value is not documented
   * and must be read off real data, which is why this takes it as a parameter rather than
   * hardcoding a guess.
   */
  async listChanged(
    query: FinaleVarianceQuery,
    options: FinaleListOptions & { changedSince: Date | string }
  ): Promise<FinalePage<FinaleVariance>> {
    const limit = options.limit ?? 100;
    const { from, to, clamped } = clampRange(options.changedSince, options.changedUntil);

    const criteria: Record<string, unknown> = { lastUpdatedDate: [from, to] };
    if (query.facilityUrl) criteria.facilityUrl = query.facilityUrl;
    if (query.statusId) criteria.statusId = query.statusId;
    if (query.physicalInventoryTypeId) {
      criteria.physicalInventoryTypeId = query.physicalInventoryTypeId;
    }

    const items = await this.http.getCollection<FinaleVariance>(
      'inventoryvariance',
      { filter: encodeFilter(criteria), limit },
      { operation: 'listFinaleVariances' }
    );

    let newest: string | undefined;
    for (const item of items) {
      const stamp = item.lastUpdatedDate;
      if (typeof stamp === 'string' && (!newest || stamp > newest)) newest = stamp;
    }

    return {
      items,
      limit,
      // Clamped means more exists beyond the window, even on a short page — without this a
      // caller would stop early and silently skip weeks of variances.
      hasMore: clamped || items.length >= limit,
      nextChangedSince: newest ?? (clamped ? to : undefined),
    };
  }
}
