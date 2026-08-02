import type {
  CancelPurchaseOrderInput,
  ClosePurchaseOrderInput,
  CreatePurchaseOrderInput,
  SetPurchaseOrderFulfillmentStatusInput,
  UpdatePurchaseOrderInput
} from '../generated/inputs';
import type { PurchaseOrder, PurchaseOrderLineItem } from '../generated/objects';
import type { PurchaseOrderQueryArgs, PurchaseOrdersQueryArgs } from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import { PURCHASE_ORDER, purchaseOrderWithLineItems } from './base/selections';

/** A receipt against one purchase order line, flattened for downstream systems. */
export interface PurchaseOrderReceiptLine {
  lineItemId?: string | null;
  sku?: string | null;
  vendorSku?: string | null;
  /** Quantity ordered on the line. */
  quantity: number;
  /** Quantity the warehouse has booked in so far. */
  quantityReceived: number;
  quantityRejected: number;
  /** Line-level fulfillment status, e.g. `pending`, `partial`, `complete`. */
  fulfillmentStatus?: string | null;
  /** When the line was last touched, the closest thing ShipHero has to a receipt date. */
  updatedAt?: string | null;
}

/** A purchase order with its receipt progress summarised. */
export interface PurchaseOrderReceipt {
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  warehouseId?: string | null;
  fulfillmentStatus?: string | null;
  /** When the goods physically arrived at the warehouse, if recorded. */
  arrivedAt?: string | null;
  /** When ShipHero closed the purchase order. */
  dateClosed?: string | null;
  /** True when every line has been received in full. */
  fullyReceived: boolean;
  lines: PurchaseOrderReceiptLine[];
  purchaseOrder: PurchaseOrder;
}

/**
 * Purchase orders, both directions: pushing an authorised order in from an ERP and
 * reading back what the warehouse received.
 *
 * ```ts
 * const po = await shiphero.purchaseOrders.create({
 *   po_number: 'PO-100045',
 *   warehouse_id: warehouseId,
 *   subtotal: '100.00',
 *   shipping_price: '0.00',
 *   total_price: '100.00',
 *   line_items: [{ sku: 'BLUE-TEE-M', quantity: 10, price: '10.00', expected_weight_in_lbs: '0.5' }]
 * });
 *
 * const receipts = await shiphero.purchaseOrders.receiptsUpdatedSince(lastRun);
 * ```
 */
export default class PurchaseOrders extends BaseResource {
  /** Default selection: header plus up to 50 line items. */
  private readonly selection = purchaseOrderWithLineItems();

  /** Fetches one purchase order by id or PO number, including line items. */
  get(args: PurchaseOrderQueryArgs, options: GetOptions = {}): Promise<PurchaseOrder | null> {
    return this.fetchObject<PurchaseOrder>('purchase_order', args, this.selection, options);
  }

  getByPoNumber(poNumber: string, options: GetOptions = {}): Promise<PurchaseOrder | null> {
    return this.get({ po_number: poNumber }, options);
  }

  /**
   * A single page of purchase orders. The default selection includes line items,
   * which multiplies the credit estimate; drop to `PURCHASE_ORDER` for header-only
   * scans.
   */
  page(
    args: PurchaseOrdersQueryArgs = {},
    options: PageOptions = {}
  ): Promise<Page<PurchaseOrder>> {
    return this.fetchPage<PurchaseOrder>('purchase_orders', args, this.selection, options);
  }

  pages(args: PurchaseOrdersQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<PurchaseOrder>('purchase_orders', args, this.selection, options);
  }

  listAll(
    args: PurchaseOrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<PurchaseOrder[]> {
    return this.collect<PurchaseOrder>('purchase_orders', args, this.selection, options);
  }

  /** Headers only, for cheap scans over wide date ranges. */
  listHeaders(
    args: PurchaseOrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<PurchaseOrder[]> {
    return this.collect<PurchaseOrder>('purchase_orders', args, PURCHASE_ORDER, options);
  }

  /**
   * Purchase orders whose line items changed at or after `since`. ShipHero derives
   * `updated_from` from line item updates, which is exactly what receiving touches,
   * so this is the polling filter for receipt sync.
   */
  updatedSince(
    since: Date | string,
    args: PurchaseOrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<PurchaseOrder[]> {
    return this.listAll({ ...args, updated_from: toISO(since) }, options);
  }

  /** Estimated credit cost of a `purchase_orders` query, without running it. */
  estimateCost(args: PurchaseOrdersQueryArgs = {}, options: PageOptions = {}): Promise<number> {
    return this.estimate('purchase_orders', args, options.selection ?? this.selection, options);
  }

  create(data: CreatePurchaseOrderInput, options: MutateOptions = {}): Promise<PurchaseOrder> {
    return this.runMutation<PurchaseOrder>(
      'purchase_order_create',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  update(data: UpdatePurchaseOrderInput, options: MutateOptions = {}): Promise<PurchaseOrder> {
    return this.runMutation<PurchaseOrder>(
      'purchase_order_update',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  /** Closes a purchase order, which stops further receiving against it. */
  close(data: ClosePurchaseOrderInput, options: MutateOptions = {}): Promise<PurchaseOrder> {
    return this.runMutation<PurchaseOrder>(
      'purchase_order_close',
      { data },
      options.selection ?? PURCHASE_ORDER,
      options
    );
  }

  cancel(data: CancelPurchaseOrderInput, options: MutateOptions = {}): Promise<PurchaseOrder> {
    return this.runMutation<PurchaseOrder>(
      'purchase_order_cancel',
      { data },
      options.selection ?? PURCHASE_ORDER,
      options
    );
  }

  setFulfillmentStatus(
    data: SetPurchaseOrderFulfillmentStatusInput,
    options: MutateOptions = {}
  ): Promise<PurchaseOrder> {
    return this.runMutation<PurchaseOrder>(
      'purchase_order_set_fulfillment_status',
      { data },
      options.selection ?? PURCHASE_ORDER,
      options
    );
  }

  /**
   * Summarises how much of each line the warehouse has booked in. Use this to post
   * receipts back to the system that raised the order.
   *
   * ShipHero has no receipt document and no per-receipt timestamp: quantities live on
   * the line items and `updated_at` is the closest available date, with `arrived_at`
   * on the header recording the physical arrival. Line items beyond the first page of
   * the selection are fetched as needed.
   */
  async receipt(purchaseOrderId: string): Promise<PurchaseOrderReceipt | null> {
    const purchaseOrder = await this.get({ id: purchaseOrderId });
    return purchaseOrder ? toReceipt(purchaseOrder) : null;
  }

  /**
   * Receipt summaries for every purchase order touched since `since`, skipping orders
   * where nothing has been received yet.
   *
   * ```ts
   * for (const receipt of await shiphero.purchaseOrders.receiptsUpdatedSince(lastRun)) {
   *   if (receipt.fullyReceived) await erp.closePurchaseOrder(receipt.poNumber);
   * }
   * ```
   */
  async receiptsUpdatedSince(
    since: Date | string,
    args: PurchaseOrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<PurchaseOrderReceipt[]> {
    const purchaseOrders = await this.updatedSince(since, args, options);
    return purchaseOrders
      .map(toReceipt)
      .filter((receipt) => receipt.lines.some((line) => line.quantityReceived > 0));
  }

  /** Line items of a purchase order, following the nested connection past the first page. */
  async lineItems(purchaseOrderId: string, pageSize = 100): Promise<PurchaseOrderLineItem[]> {
    const items: PurchaseOrderLineItem[] = [];
    let after: string | undefined;

    for (;;) {
      const cursor = after ? `, after: "${after}"` : '';
      const purchaseOrder = await this.get(
        { id: purchaseOrderId },
        {
          selection: `
            id
            line_items(first: ${pageSize}${cursor}) {
              pageInfo { hasNextPage endCursor }
              edges { node { id sku vendor_sku quantity quantity_received quantity_rejected price product_name fulfillment_status note partner_line_item_id updated_at created_at } }
            }
          `
        }
      );

      const connection = purchaseOrder?.line_items;
      for (const edge of connection?.edges ?? []) if (edge.node) items.push(edge.node);

      if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) return items;
      after = connection.pageInfo.endCursor;
    }
  }
}

function toReceipt(purchaseOrder: PurchaseOrder): PurchaseOrderReceipt {
  const lines: PurchaseOrderReceiptLine[] = (purchaseOrder.line_items?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is PurchaseOrderLineItem => Boolean(node))
    .map((node) => ({
      lineItemId: node.id,
      sku: node.sku,
      vendorSku: node.vendor_sku,
      quantity: node.quantity ?? 0,
      quantityReceived: node.quantity_received ?? 0,
      quantityRejected: node.quantity_rejected ?? 0,
      fulfillmentStatus: node.fulfillment_status,
      updatedAt: node.updated_at
    }));

  return {
    purchaseOrderId: purchaseOrder.id,
    poNumber: purchaseOrder.po_number,
    warehouseId: purchaseOrder.warehouse_id,
    fulfillmentStatus: purchaseOrder.fulfillment_status,
    arrivedAt: purchaseOrder.arrived_at,
    dateClosed: purchaseOrder.date_closed,
    fullyReceived:
      lines.length > 0 && lines.every((line) => line.quantityReceived >= line.quantity),
    lines,
    purchaseOrder
  };
}
