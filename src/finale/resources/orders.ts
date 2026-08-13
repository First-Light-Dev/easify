/**
 * Finale orders — creating purchase orders, and reading the ones the warehouse has completed.
 *
 * Two properties of the API shape this file.
 *
 * `orderItemList` comes back only when fetching a single order; a collection read returns
 * headers alone. So reading receipt quantities means listing changed orders, then fetching
 * each one — 1 + N requests against a budget of 300 collection reads per hour. `listChanged`
 * returns headers and `getWithItems` is a separate call, so a caller pays the per-record cost
 * only for records it actually cares about.
 *
 * Filtering uses a base64-encoded `filter` parameter with closed ranges, and there is no
 * offset. Paging is therefore a moving `lastUpdatedDate` lower bound, and
 * `FinalePage.nextChangedSince` carries that cursor forward.
 *
 * There is no method for creating a sales order. Where another system already feeds Finale
 * its outbound orders, creating them here would produce duplicates — so this package only
 * reads them.
 */

import type { FinaleHttpClient } from '../client/http-client';
import {
  clampRange,
  encodeFilter,
  toFinaleDate,
  type FinaleListOptions,
  type FinalePage,
} from '../types/common';
import type {
  FinaleOrder,
  FinaleOrderInput,
  FinaleOrderQuery,
  FinaleOrderStatus,
  FinaleOrderType,
} from '../types/orders';

/**
 * Statuses meaning "this order is finished".
 *
 * Some workflows park orders at `ORDER_LOCKED` before completing them. A poller watching
 * only `ORDER_COMPLETED` would never see those, and nothing would appear to be wrong —
 * records simply stop arriving.
 *
 * Exported so the host can widen it without a package change.
 */
export const DEFAULT_COMPLETED_STATUSES: readonly FinaleOrderStatus[] = ['ORDER_COMPLETED'];

export class FinaleOrders {
  constructor(private readonly http: FinaleHttpClient) {}

  /**
   * Creates a purchase order.
   *
   * `referenceNumber` is how the resulting receipt is later matched back to whatever asked
   * for the order. Enforced rather than trusted: an order created without one cannot be
   * reconciled, and the failure surfaces days later as a record that never completes.
   *
   * `destinationFacilityUrl` is required for a purchase — stock has to arrive somewhere, and
   * Finale's schema notes it cannot be a sublocation.
   */
  async createPurchaseOrder(
    input: Omit<FinaleOrderInput, 'orderTypeId'>
  ): Promise<FinaleOrder> {
    this.assertReference(input.referenceNumber);
    this.assertItems(input);

    if (!input.destinationFacilityUrl) {
      throw new TypeError(
        'createPurchaseOrder requires destinationFacilityUrl — a purchase order is stock ' +
          'arriving, and Finale needs to know where. Note it cannot be a sublocation.'
      );
    }

    return this.http.post<FinaleOrder>(
      'order',
      { ...input, orderTypeId: 'PURCHASE_ORDER' satisfies FinaleOrderType },
      { operation: 'createPurchaseOrder', recordId: input.referenceNumber }
    );
  }

  /**
   * One order **including its line items**.
   *
   * The only way to get `orderItemList` — collection reads omit it. Counts against the
   * 120 GET/minute budget rather than the 300/hour collection budget, so per-record fetches
   * are the cheaper of the two.
   */
  async getWithItems(orderId: string): Promise<FinaleOrder> {
    return this.http.get<FinaleOrder>(`order/${encodeURIComponent(orderId)}`, undefined, {
      operation: 'getFinaleOrder',
      recordId: orderId,
    });
  }

  /**
   * Finds an order by the reference stamped on it.
   *
   * The recovery path when a correlation record is missing, and the only route for orders
   * created by something else — an order this client never created has an id it never saw,
   * leaving `referenceNumber` as the sole thread back.
   *
   * Returns null rather than throwing: "no such order" is a normal answer when checking
   * whether something landed.
   */
  async findByReference(reference: string): Promise<FinaleOrder | null> {
    const wanted = reference.trim();
    if (!wanted) return null;

    const items = await this.http.getCollection<FinaleOrder>(
      'order',
      { filter: encodeFilter({ referenceNumber: wanted }), limit: 10 },
      { operation: 'findFinaleOrderByReference', recordId: wanted }
    );

    // Exact match rather than trusting the filter: Finale's range filter is inclusive, and
    // returning a different transfer's order would corrupt the correlation.
    return items.find((order) => order.referenceNumber?.trim() === wanted) ?? null;
  }

  /**
   * One page of orders changed in a window.
   *
   * Returns **headers only** — no `orderItemList`. Callers that need quantities follow up
   * with `getWithItems` per record.
   *
   * `changedSince` is mandatory in practice: Finale requires a closed `lastUpdatedDate`
   * range, rejects ranges wider than 30 days, and requires the filter at all once a
   * collection exceeds 120K entities.
   */
  async listChanged(
    query: FinaleOrderQuery,
    options: FinaleListOptions & { changedSince: Date | string }
  ): Promise<FinalePage<FinaleOrder>> {
    const limit = options.limit ?? 100;
    const { from, to, clamped } = clampRange(options.changedSince, options.changedUntil);

    const criteria: Record<string, unknown> = { lastUpdatedDate: [from, to] };
    if (query.orderTypeId) criteria.orderTypeId = query.orderTypeId;
    if (query.statusId) criteria.statusId = query.statusId;
    if (query.referenceNumber) criteria.referenceNumber = query.referenceNumber;

    const items = await this.http.getCollection<FinaleOrder>(
      'order',
      { filter: encodeFilter(criteria), limit },
      { operation: 'listFinaleOrders' }
    );

    return {
      items,
      limit,
      // A clamped window means there is definitely more beyond it, even if this page was
      // short — otherwise a caller would stop early and silently skip weeks of records.
      hasMore: clamped || items.length >= limit,
      nextChangedSince: newestTimestamp(items) ?? (clamped ? to : undefined),
    };
  }

  /**
   * Purchase orders completed in a window.
   *
   * What a completed order means is the caller's decision, made by looking up its correlation
   * record. That routing is business logic and stays out of this package.
   */
  async listCompletedPurchaseOrders(
    options: FinaleListOptions & { changedSince: Date | string; statuses?: readonly FinaleOrderStatus[] }
  ): Promise<FinalePage<FinaleOrder>> {
    return this.listByStatuses('PURCHASE_ORDER', options.statuses ?? DEFAULT_COMPLETED_STATUSES, options);
  }

  /**
   * Sales orders completed in a window.
   *
   * These are typically created by another system feeding Finale, so correlation is on
   * `referenceNumber` rather than an id this client recorded.
   */
  async listCompletedSalesOrders(
    options: FinaleListOptions & { changedSince: Date | string; statuses?: readonly FinaleOrderStatus[] }
  ): Promise<FinalePage<FinaleOrder>> {
    return this.listByStatuses('SALES_ORDER', options.statuses ?? DEFAULT_COMPLETED_STATUSES, options);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  /**
   * Lists across several statuses.
   *
   * One request per status. Finale's filter values are `[lower, upper]` ranges, so a set of
   * unrelated statuses cannot be expressed as one range — `['ORDER_LOCKED','ORDER_COMPLETED']`
   * would be read as a *range* and match whatever sorts between them. Separate requests are
   * slower but cannot silently over-match.
   */
  private async listByStatuses(
    orderTypeId: FinaleOrderType,
    statuses: readonly FinaleOrderStatus[],
    options: FinaleListOptions & { changedSince: Date | string }
  ): Promise<FinalePage<FinaleOrder>> {
    if (statuses.length === 1) {
      return this.listChanged({ orderTypeId, statusId: statuses[0] }, options);
    }

    const pages = await Promise.all(
      statuses.map((statusId) => this.listChanged({ orderTypeId, statusId }, options))
    );

    const seen = new Set<string>();
    const items: FinaleOrder[] = [];
    for (const page of pages) {
      for (const order of page.items) {
        const key = order.orderUrl ?? order.orderId ?? JSON.stringify(order);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(order);
      }
    }

    return {
      items,
      limit: options.limit ?? 100,
      hasMore: pages.some((page) => page.hasMore),
      nextChangedSince: newestTimestamp(items),
    };
  }

  private assertReference(reference: string | undefined): void {
    const value = reference?.trim();
    if (!value) {
      throw new TypeError(
        'createPurchaseOrder requires referenceNumber — it is the only way the resulting ' +
            'receipt can be matched back. An order created without it cannot be reconciled.'
      );
    }
    // Finale documents a 60-character ceiling. Truncation would corrupt the correlation
    // silently, so this fails instead.
    if (value.length > 60) {
      throw new TypeError(
        `referenceNumber is ${value.length} characters; Finale allows 60. Truncating would ` +
          `break the correlation.`
      );
    }
  }

  private assertItems(input: { orderItemList?: unknown[] }): void {
    if (input.orderItemList && input.orderItemList.length > 0) return;
    throw new TypeError(
      'createPurchaseOrder was called with no order items. An empty order tells the ' +
          'warehouse nothing and is far more likely a mapping that produced nothing than a ' +
          'deliberate request.'
    );
  }
}

/**
 * The newest `lastUpdatedDate` in a page, for the next request's lower bound.
 *
 * Finale's filters are inclusive, so the next page re-reads this record. That overlap is
 * deliberate — Finale's own paging guidance recommends it — and is why the host
 * deduplicates on a stable event id rather than assuming each record arrives once.
 */
function newestTimestamp(items: FinaleOrder[]): string | undefined {
  let newest: string | undefined;
  for (const item of items) {
    const stamp = item.lastUpdatedDate;
    if (typeof stamp !== 'string') continue;
    if (!newest || stamp > newest) newest = stamp;
  }
  return newest;
}

export { newestTimestamp, toFinaleDate };
