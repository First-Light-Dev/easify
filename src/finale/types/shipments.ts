/**
 * Finale shipment types — the record of goods physically moving, as opposed to the order that
 * asked for it.
 *
 * Orders and shipments are separate collections joined ONE WAY: a shipment carries
 * `primaryOrderUrl`, and the order carries no shipment list at all. So "what was received
 * against this order?" cannot be asked of the order — the shipment collection has to be scanned
 * and matched backwards. Verified against the live account on 2026-09-25.
 *
 * This matters because a Finale purchase order's status does NOT move when goods arrive. Across
 * a sample window LastMile had 19 purchase orders and zero at `ORDER_COMPLETED`, while their
 * receipts sat in `PURCHASE_SHIPMENT` records. A consumer watching order status for a receipt
 * waits forever, with nothing erroring.
 *
 * Column-major on collection reads like everything else Finale returns — see
 * `transposeCollection`.
 */

/**
 * What kind of movement this is.
 *
 * The terminal status differs per type, which is why a caller cannot use one constant for all
 * three: outbound finishes at `SHIPMENT_SHIPPED`, inbound and transfers at `SHIPMENT_DELIVERED`.
 */
export type FinaleShipmentType =
  | 'SALES_SHIPMENT'
  | 'PURCHASE_SHIPMENT'
  | 'TRANSFER'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Observed shipment statuses. Finale publishes no vocabulary for these, so the list is what the
 * live account actually produces; the open union keeps an unseen value from breaking a consumer.
 *
 * `SHIPMENT_INPUT` is the state a shipment is born in — it exists but nothing has been counted.
 * Acting on a shipment's mere existence is therefore wrong; wait for the terminal status.
 */
export type FinaleShipmentStatus =
  | 'SHIPMENT_INPUT'
  | 'SHIPMENT_PACKED'
  | 'SHIPMENT_SHIPPED'
  | 'SHIPMENT_DELIVERED'
  | 'SHIPMENT_UNPACKED'
  | 'SHIPMENT_CANCELLED'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** One product within a shipment. */
export interface FinaleShipmentLine {
  productId?: string;
  productUrl?: string;
  /**
   * Quantity moved. Normally positive; a correction reversing an earlier over-receipt is
   * negative, so a caller summing receipts must respect the sign rather than take an absolute
   * value. Observed on the live account 2026-09-25: one order's receipts read `-184` then `+36`.
   */
  quantity?: number;
  facilityUrl?: string;
  [key: string]: unknown;
}

/** A shipment record. */
export interface FinaleShipment {
  shipmentUrl?: string;
  shipmentId?: string;
  /** Human-facing id, e.g. `TR-00601-1`. */
  shipmentIdUser?: string;
  shipmentTypeId?: FinaleShipmentType;
  statusId?: FinaleShipmentStatus;
  /** The order this shipment fulfils or receives against. The only join back to an order. */
  primaryOrderUrl?: string;
  /**
   * When goods arrived. Set on receipt, and the date a consumer should book the movement to —
   * a polled feed can lag the physical event, so `now()` would land in the wrong period.
   */
  receiveDate?: string;
  shipDate?: string;
  packDate?: string;
  originFacilityUrl?: string;
  destinationFacilityUrl?: string;
  /** Carrier tracking, where one exists. Absent on receipts. */
  trackingCode?: string;
  shipmentItemList?: FinaleShipmentLine[];
  lastUpdatedDate?: string;
  createdDate?: string;
  [key: string]: unknown;
}

/** Narrowing applied to a shipment listing. Matched client-side — see `FinaleShipments`. */
export interface FinaleShipmentQuery {
  shipmentTypeId?: FinaleShipmentType;
  statusId?: FinaleShipmentStatus;
}
