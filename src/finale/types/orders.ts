/**
 * Finale order types.
 *
 * A Finale order covers both directions: `PURCHASE_ORDER` for stock arriving,
 * `SALES_ORDER` for stock leaving. The facility fields are directional and not
 * interchangeable — `destinationFacilityUrl` on a purchase, `originFacilityUrl` on a sale.
 *
 * `referenceNumber` carries the originating system's reference, capped at 60 characters. It is
 * how a polled Finale record is matched back, so it is never omitted or trimmed.
 *
 * One shape detail governs how the pollers are written: `orderItemList` comes back only when
 * fetching a single order, never on a collection read. Listing completed orders gives headers
 * alone, so reading receipt quantities costs a follow-up GET per order. That is why
 * `FinaleOrders` exposes `get()` separately rather than treating a list as sufficient.
 */

import type { FinaleUrl } from './common';

/**
 * Order type. The union stays open because Finale documents the field without enumerating
 * every value, so an unfamiliar one should type-check rather than break a read.
 */
export type FinaleOrderType =
  | 'PURCHASE_ORDER'
  | 'SALES_ORDER'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Order status.
 *
 * `ORDER_COMPLETED` is the one worth watching: a completed purchase order means stock was
 * received, a completed sales order means goods went out.
 *
 * `ORDER_LOCKED` sits between created and completed. Some workflows park orders there, so a
 * poller watching only `ORDER_COMPLETED` can miss them.
 *
 * Read-only — state changes go through the action URLs on the record.
 */
export type FinaleOrderStatus =
  | 'ORDER_EMBRYONIC'
  | 'ORDER_CREATED'
  | 'ORDER_LOCKED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** One line on an order being created. */
export interface FinaleOrderItemInput {
  /**
   * Finale product reference.
   *
   * Must come from a fetched product — Finale's docs warn its internal product identifier
   * differs from the external resource id, so a URL built by string concatenation can be
   * wrong. Use `products.resolveUrl(sku)`.
   */
  productUrl: FinaleUrl;
  quantity: number;
  /** Unit cost. Optional — Finale values stock on receipt if it is absent. */
  unitPrice?: number;
}

/**
 * Body for creating an order.
 *
 * `referenceNumber` is how a Finale record is matched back to whatever it came from, so it
 * is the field an integration hangs off. Max 60 Unicode characters.
 *
 * Facility fields are directional and **not interchangeable** — `destinationFacilityUrl`
 * for a purchase (stock arriving), `originFacilityUrl` for a sales order (stock leaving).
 * Finale's schema notes neither may be a sublocation.
 */
export interface FinaleOrderInput {
  orderTypeId: FinaleOrderType;
  /** The originating system's reference. Max 60 chars. Do not omit — see above. */
  referenceNumber: string;
  /** Purchases: where stock arrives. Cannot be a sublocation. */
  destinationFacilityUrl?: FinaleUrl;
  /** Sales orders: where stock leaves from. Cannot be a sublocation. */
  originFacilityUrl?: FinaleUrl;
  orderDate?: string;
  /** Estimated receive date — purchases and transfers. */
  receiveDate?: string;
  /** Estimated ship date — sales and transfers. */
  shipDate?: string;
  /** Visible to the supplier/customer. */
  publicNotes?: string;
  /** Not shown to the supplier. A good place for the originating record's details. */
  privateNotes?: string;
  /** Party associations: the supplier on a purchase, the customer on a sale. */
  orderRoleList?: unknown[];
  orderItemList: FinaleOrderItemInput[];
}

/** A line as Finale returns it. */
export interface FinaleOrderItem {
  productUrl?: string;
  quantity?: number;
  /** Quantity actually received or shipped, as opposed to the quantity ordered. */
  quantityReceived?: number;
  quantityShipped?: number;
  [key: string]: unknown;
}

/**
 * An order as Finale returns it.
 *
 * Loose, because Finale returns a large record and adds fields. The named ones are what
 * this integration depends on.
 */
export interface FinaleOrder {
  /**
   * The sales channel the order arrived from — for an order pulled in by Finale's ShipStation
   * connection, this is the ShipStation **store name**, not its numeric id.
   *
   * Load-bearing in a shared 3PL account: one Finale account can serve many clients, and this
   * is the only field naming which one an order belongs to. It is a display name, so treat it
   * as a guard rather than a correlation key — renaming the store in ShipStation changes it.
   */
  saleSourceId?: string;

  /** Full record URL — the id the host correlates by. Read-only. */
  orderUrl?: string;
  /** Max 20 ASCII chars, read-only after creation. */
  orderId?: string;
  orderTypeId?: FinaleOrderType;
  /** The reference stamped at creation. Read-only afterwards. */
  referenceNumber?: string;
  /** Read-only; changed via the action URLs. */
  statusId?: FinaleOrderStatus;
  originFacilityUrl?: string;
  destinationFacilityUrl?: string;
  processingFacilityUrl?: string;
  orderDate?: string;
  shipDate?: string;
  receiveDate?: string;
  /** Server-set, read-only. What the pollers watermark on. */
  createdDate?: string;
  lastUpdatedDate?: string;
  publicNotes?: string;
  privateNotes?: string;
  orderRoleList?: unknown[];
  /** **Single-order fetches only** — absent from collection reads. See the file header. */
  orderItemList?: FinaleOrderItem[];
  /** State-transition URLs, present only when valid for the current status. */
  actionUrlCancel?: string;
  actionUrlComplete?: string;
  actionUrlLock?: string;
  actionUrlEdit?: string;
  userFieldDataList?: unknown[];
  [key: string]: unknown;
}

/** Filters for listing orders. Values become `[value, value]` exact-match ranges. */
export interface FinaleOrderQuery {
  orderTypeId?: FinaleOrderType;
  statusId?: FinaleOrderStatus;
  /** Find one order by the reference stamped on it. */
  referenceNumber?: string;
}
