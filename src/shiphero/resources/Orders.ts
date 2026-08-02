import type {
  AddHistoryInput,
  AddLineItemsInput,
  CancelOrderInput,
  ChangeOrderWarehouseInput,
  CreateOrderInput,
  RemoveLineItemsInput,
  UpdateLineItemsInput,
  UpdateOrderFulfillmentStatusInput,
  UpdateOrderHoldsInput,
  UpdateOrderInput,
  UpdateTagsInput
} from '../generated/inputs';
import type { LineItem, Order, OrderHistory, Shipment } from '../generated/objects';
import type {
  OrderHistoryQueryArgs,
  OrderQueryArgs,
  OrdersQueryArgs
} from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import { ORDER, orderWithLineItems, orderWithPicks, shipment } from './base/selections';

/** How far along picking is for one order. */
export interface OrderPickProgress {
  orderId?: string | null;
  orderNumber?: string | null;
  partnerOrderId?: string | null;
  fulfillmentStatus?: string | null;
  /** ShipHero's own flag: allocations are complete and the order can ship. */
  readyToShip?: boolean | null;
  /** Total units across all line items. */
  quantity: number;
  /** Units scanned into a tote by a picker. */
  quantityPicked: number;
  /** Units already shipped. */
  quantityShipped: number;
  /** True when at least one unit has been picked. */
  started: boolean;
  /** True when every unit has been picked or already shipped. */
  complete: boolean;
  order: Order;
}

/**
 * Sales orders. Also the vehicle for outbound stock movements: a transfer out of a
 * 3PL is modelled as an order in ShipHero.
 *
 * ```ts
 * const order = await shiphero.orders.create({
 *   order_number: 'ST-000123',
 *   shop_name: 'cin7',
 *   shipping_address: { first_name: 'Receiving', last_name: 'Dock', address1: '...', city: '...', state: '...', country: 'US', zip: '...' },
 *   line_items: [{ sku: 'BLUE-TEE-M', quantity: 5, price: '10.00' }]
 * });
 *
 * const picked = await shiphero.orders.pickedSince(lastRun);
 * ```
 */
export default class Orders extends BaseResource {
  private readonly selection = orderWithLineItems();

  get(args: OrderQueryArgs, options: GetOptions = {}): Promise<Order | null> {
    return this.fetchObject<Order>('order', args, this.selection, options);
  }

  /** Fetches an order by the number it was created with. */
  async getByOrderNumber(orderNumber: string, options: GetOptions = {}): Promise<Order | null> {
    const [order] = await this.listAll({ order_number: orderNumber }, { ...options, max: 1 });
    return order ?? null;
  }

  /** Fetches an order by the identifier of the system that created it. */
  async getByPartnerOrderId(
    partnerOrderId: string,
    options: GetOptions = {}
  ): Promise<Order | null> {
    const [order] = await this.listAll(
      { partner_order_id: partnerOrderId },
      { ...options, max: 1 }
    );
    return order ?? null;
  }

  page(args: OrdersQueryArgs = {}, options: PageOptions = {}): Promise<Page<Order>> {
    return this.fetchPage<Order>('orders', args, this.selection, options);
  }

  pages(args: OrdersQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<Order>('orders', args, this.selection, options);
  }

  listAll(args: OrdersQueryArgs = {}, options: ListAllOptions = {}): Promise<Order[]> {
    return this.collect<Order>('orders', args, this.selection, options);
  }

  /** Headers only, for cheap scans. */
  listHeaders(args: OrdersQueryArgs = {}, options: ListAllOptions = {}): Promise<Order[]> {
    return this.collect<Order>('orders', args, ORDER, options);
  }

  updatedSince(
    since: Date | string,
    args: OrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Order[]> {
    return this.listAll({ ...args, updated_from: toISO(since) }, options);
  }

  /** Estimated credit cost of an `orders` query, without running it. */
  estimateCost(args: OrdersQueryArgs = {}, options: PageOptions = {}): Promise<number> {
    return this.estimate('orders', args, options.selection ?? this.selection, options);
  }

  /**
   * Picking progress for orders touched since `since`.
   *
   * ShipHero has no "picked" order status and no filter for one. Progress is
   * reconstructed from `tote_picks` on each line item, which is what a picker's scans
   * write to, combined with `ready_to_ship` and quantities already shipped. Poll this
   * to detect that a transfer has physically left the shelf.
   *
   * ```ts
   * for (const progress of await shiphero.orders.pickedSince(lastRun)) {
   *   if (progress.complete) await erp.markTransferInTransit(progress.orderNumber);
   * }
   * ```
   */
  async pickedSince(
    since: Date | string,
    args: OrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<OrderPickProgress[]> {
    const orders = await this.collect<Order>(
      'orders',
      { ...args, updated_from: toISO(since) },
      orderWithPicks(),
      options
    );
    return orders.map(toPickProgress).filter((progress) => progress.started);
  }

  /** Picking progress for one order. */
  async pickProgress(orderId: string): Promise<OrderPickProgress | null> {
    const order = await this.get({ id: orderId }, { selection: orderWithPicks() });
    return order ? toPickProgress(order) : null;
  }

  /**
   * Orders ShipHero considers ready to ship, allocated within the given window. Pair
   * `allocated_from` with `ready_to_ship` as ShipHero recommends for polling, since
   * re-allocation can surface an order in consecutive windows.
   */
  readyToShipSince(
    since: Date | string,
    args: OrdersQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Order[]> {
    return this.listAll({ ...args, ready_to_ship: true, allocated_from: toISO(since) }, options);
  }

  /** Audit trail entries for an order. */
  history(args: OrderHistoryQueryArgs = {}, options: ListAllOptions = {}): Promise<OrderHistory[]> {
    return this.collect<OrderHistory>(
      'order_history',
      args,
      `id legacy_id order_id order_number user_id username information created_at`,
      options
    );
  }

  create(data: CreateOrderInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_create',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  update(data: UpdateOrderInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_update',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  cancel(data: CancelOrderInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>('order_cancel', { data }, options.selection ?? ORDER, options);
  }

  setFulfillmentStatus(
    data: UpdateOrderFulfillmentStatusInput,
    options: MutateOptions = {}
  ): Promise<Order> {
    return this.runMutation<Order>(
      'order_update_fulfillment_status',
      { data },
      options.selection ?? ORDER,
      options
    );
  }

  addLineItems(data: AddLineItemsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_add_line_items',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  updateLineItems(data: UpdateLineItemsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_update_line_items',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  removeLineItems(data: RemoveLineItemsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_remove_line_items',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  /** Places or clears the holds that keep an order from shipping. */
  updateHolds(data: UpdateOrderHoldsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_update_holds',
      { data },
      options.selection ??
        `${ORDER} holds { fraud_hold payment_hold operator_hold address_hold shipping_method_hold client_hold }`,
      options
    );
  }

  changeWarehouse(data: ChangeOrderWarehouseInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_change_warehouse',
      { data },
      options.selection ?? ORDER,
      options
    );
  }

  addTags(data: UpdateTagsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_add_tags',
      { data },
      options.selection ?? `id legacy_id order_number tags`,
      options
    );
  }

  setTags(data: UpdateTagsInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_update_tags',
      { data },
      options.selection ?? `id legacy_id order_number tags`,
      options
    );
  }

  addHistoryEntry(data: AddHistoryInput, options: MutateOptions = {}): Promise<Order> {
    return this.runMutation<Order>(
      'order_add_history_entry',
      { data },
      options.selection ?? ORDER,
      options
    );
  }

  /**
   * Marks an order shipped without ShipHero generating a label, for fulfilment that
   * happened elsewhere. Returns the shipment it created.
   */
  fulfill(data: Record<string, unknown>, options: MutateOptions = {}): Promise<Shipment> {
    return this.runMutation<Shipment>(
      'order_fulfill',
      { data },
      options.selection ?? shipment(),
      options
    );
  }
}

function toPickProgress(order: Order): OrderPickProgress {
  const lineItems = (order.line_items?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is LineItem => Boolean(node));

  let quantity = 0;
  let quantityPicked = 0;
  let quantityShipped = 0;

  for (const item of lineItems) {
    quantity += item.quantity ?? 0;
    quantityShipped += item.quantity_shipped ?? 0;
    for (const pick of item.tote_picks ?? []) quantityPicked += pick.picked_quantity ?? 0;
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    partnerOrderId: order.partner_order_id,
    fulfillmentStatus: order.fulfillment_status,
    readyToShip: order.ready_to_ship,
    quantity,
    quantityPicked,
    quantityShipped,
    started: quantityPicked > 0 || quantityShipped > 0,
    complete: quantity > 0 && quantityPicked + quantityShipped >= quantity,
    order
  };
}
