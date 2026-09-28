/**
 * Finale shipments — the physical movement record: goods received against a purchase order, or
 * despatched against a sales order.
 *
 * This is how a RECEIPT is detected. A Finale purchase order stays `ORDER_CREATED` when stock
 * arrives — LastMile never completes them, measured at 19 purchase orders and zero completed —
 * so the only evidence of arrival is a `PURCHASE_SHIPMENT` reaching `SHIPMENT_DELIVERED`.
 *
 * Reads only. Receiving is a warehouse action performed in Finale; creating shipments from
 * outside produced a record Finale never linked to its order (tried 2026-09-10), so it is
 * deliberately not offered here.
 */

import type { FinaleHttpClient } from '../client/http-client';
import { clampRange, encodeFilter, type FinaleListOptions, type FinalePage } from '../types/common';
import type { FinaleShipment, FinaleShipmentQuery } from '../types/shipments';

export class FinaleShipments {
  constructor(private readonly http: FinaleHttpClient) {}

  /** One shipment by its Finale id. */
  async get(shipmentId: string): Promise<FinaleShipment> {
    return this.http.get<FinaleShipment>(
      `shipment/${encodeURIComponent(shipmentId)}`,
      undefined,
      { operation: 'getFinaleShipment', recordId: shipmentId }
    );
  }

  /**
   * One page of shipments changed in a window.
   *
   * ONLY the date range is sent to Finale; `shipmentTypeId` and `statusId` are matched here, on
   * the rows that came back. That is load-bearing, not styling: Finale applies `limit` as a SCAN
   * WINDOW *before* filtering, so a server-side filter returns nothing whenever the matching rows
   * sit past the first `limit` of the range — and an empty page leaves the caller's watermark
   * unmoved, so the next tick re-reads the same rows forever. The order resource learned this the
   * expensive way; the same shape is used here deliberately.
   *
   * `hasMore` and `nextChangedSince` therefore derive from what was SCANNED, never from what
   * matched, so a page that matched nothing still moves the caller forward.
   */
  async listChanged(
    query: FinaleShipmentQuery,
    options: FinaleListOptions & { changedSince: Date | string }
  ): Promise<FinalePage<FinaleShipment>> {
    const limit = options.limit ?? 100;
    const { from, to, clamped } = clampRange(options.changedSince, options.changedUntil);

    const scanned = await this.http.getCollection<FinaleShipment>(
      'shipment',
      { filter: encodeFilter({ lastUpdatedDate: [from, to] }), limit },
      { operation: 'listFinaleShipments' }
    );

    const items = scanned.filter(
      (shipment) =>
        (!query.shipmentTypeId || shipment.shipmentTypeId === query.shipmentTypeId) &&
        (!query.statusId || shipment.statusId === query.statusId)
    );

    let newest: string | undefined;
    for (const shipment of scanned) {
      const stamp = shipment.lastUpdatedDate;
      if (typeof stamp === 'string' && (!newest || stamp > newest)) newest = stamp;
    }

    return {
      items,
      limit,
      hasMore: clamped || scanned.length >= limit,
      nextChangedSince: newest ?? (clamped ? to : undefined),
    };
  }
}
