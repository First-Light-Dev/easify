/**
 * ShipStation order types.
 *
 * VERIFY: field names follow ShipStation's publicly documented V1 order model. Nothing
 * here was confirmed against the 3PL's account.
 *
 * The reason this integration exists at all: a Cin7 stock transfer leaving the USA is,
 * to the 3PL, an order to pick and ship. Same physical event, two models — and the 3PL
 * works orders in ShipStation rather than Finale.
 *
 * `orderKey` is the field that matters most for correctness, and it is easy to miss.
 * ShipStation's `createorder` is an **upsert**: posting again with the same `orderKey`
 * updates the existing order rather than creating a second one. That makes a retried
 * create naturally idempotent, which matters because Cloud Tasks can deliver a task
 * twice. Omit `orderKey` and a redelivery creates a duplicate order — the 3PL picks and
 * ships the same stock twice.
 */

/**
 * Order status.
 *
 * `awaiting_shipment` is what a new order to be picked should be: it puts the order in
 * the 3PL's work queue. `awaiting_payment` would hold it invisibly — the stock is
 * already owned, so there is nothing to pay.
 *
 * Only the **open** statuses — `awaiting_payment`, `awaiting_shipment`, `on_hold` — can be
 * updated by `createorder`. `shipped` and `cancelled` orders reject the update outright,
 * which bounds the upsert's usefulness for retries. See `ShipStationOrders.createOrder`.
 *
 * The union stays open so a value ShipStation adds later still type-checks rather than
 * breaking a read.
 */
export type ShipStationOrderStatus =
  | 'awaiting_payment'
  | 'awaiting_shipment'
  | 'pending_fulfillment'
  | 'shipped'
  | 'on_hold'
  | 'cancelled'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** A postal address. */
export interface ShipStationAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  street3?: string;
  city: string;
  /** State/province. ShipStation expects a code for US/CA, a name elsewhere. VERIFY. */
  state: string;
  postalCode: string;
  /** Two-letter ISO country code, e.g. `AU`, `ID`. */
  country: string;
  phone?: string;
  residential?: boolean;
}

/** One line on an order. */
export interface ShipStationOrderItemInput {
  /**
   * Stable per-line key. Like `orderKey` at the order level, this is what makes a
   * re-sent order update its lines instead of appending duplicates.
   */
  lineItemKey?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  warehouseLocation?: string;
}

/**
 * Body for `POST /orders/createorder`.
 *
 * Note this is an upsert, not a create — see the `orderKey` note above.
 */
export interface ShipStationOrderInput {
  /**
   * Human-readable reference. Set to the Cin7 transfer number, e.g. `ST-009876`.
   *
   * **Max 50 characters.** It is also the correlation key that must survive into Finale for
   * flow 4b, so silent truncation would break the return path with nothing erroring —
   * `createOrder` rejects an over-long value rather than letting ShipStation trim it.
   */
  orderNumber: string;
  /**
   * Idempotency key. Set it, always.
   *
   * Derived from the Cin7 transfer so a redelivered Cloud Task updates rather than
   * duplicates the order. This is the difference between a retry being harmless and the
   * 3PL shipping the same stock twice.
   */
  orderKey?: string;
  orderDate: string;
  /** `awaiting_shipment` for anything the 3PL should act on. */
  orderStatus: ShipStationOrderStatus;
  shipByDate?: string;

  /**
   * Where the goods are going.
   *
   * For a transfer this is a Lox & Chain location (Melbourne, Bali) — not a customer.
   * ShipStation requires an address on every order regardless, so the destination
   * addresses come from host configuration.
   */
  shipTo: ShipStationAddress;
  /**
   * Required by ShipStation, even though a stock transfer has no biller.
   *
   * `createOrder` defaults it to `shipTo` when omitted — there is no meaningful bill-to for
   * an internal stock movement, and mirroring the destination is the least surprising thing
   * to send. Declared required here so the default is a deliberate choice at one call site
   * rather than an omission that reaches ShipStation as a 400.
   */
  billTo: ShipStationAddress;

  customerUsername?: string;
  customerEmail?: string;

  items: ShipStationOrderItemInput[];

  /** Visible to the 3PL on the packing slip. Good place for the Cin7 reference. */
  customerNotes?: string;
  internalNotes?: string;

  /**
   * ShipStation charges tax/shipping/total on real orders. A stock transfer has no
   * commercial value, so these are zero — but sending nothing at all can make an order
   * look unpaid and hold it. VERIFY against the 3PL's workflow.
   */
  amountPaid?: number;
  taxAmount?: number;
  shippingAmount?: number;

  advancedOptions?: {
    storeId?: number;
    customField1?: string;
    customField2?: string;
    customField3?: string;
    [key: string]: unknown;
  };
}

/**
 * An order as ShipStation returns it.
 *
 * Loose, because ShipStation returns a large record and adds fields over time. The named
 * ones are what the app depends on: `orderId` is stored in `record_links`, and
 * `orderNumber` is the reference that must survive into Finale for flow 4b.
 */
export interface ShipStationOrder {
  orderId?: number;
  orderNumber?: string;
  orderKey?: string;
  orderStatus?: ShipStationOrderStatus;
  orderDate?: string;
  createDate?: string;
  modifyDate?: string;
  shipTo?: ShipStationAddress;
  items?: Array<{
    orderItemId?: number;
    lineItemKey?: string;
    sku?: string;
    name?: string;
    quantity?: number;
    [key: string]: unknown;
  }>;
  advancedOptions?: Record<string, unknown>;
  [key: string]: unknown;
}
