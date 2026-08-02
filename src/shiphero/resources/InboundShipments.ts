import type { CreateInboundShipmentInput, UpdateInboundShipmentInput } from '../generated/inputs';
import type {
  InboundShipment,
  InboundShipmentLocationSummaryData,
  InboundShipmentSummaryData
} from '../generated/objects';
import type { InboundShipmentQueryArgs, InboundShipmentsQueryArgs } from '../generated/operations';
import type { InboundShipmentStatus } from '../generated/enums';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import {
  INBOUND_SHIPMENT,
  INBOUND_SHIPMENT_LOCATION_SUMMARY,
  INBOUND_SHIPMENT_SUMMARY,
  inboundShipmentWithPurchaseOrders
} from './base/selections';

/**
 * Inbound shipments: the receiving appointment a warehouse books against one or more
 * purchase orders.
 *
 * The status lifecycle is `PENDING_ARRIVAL` to `ARRIVED` to `RECEIVING` to
 * `COMPLETED`, and `status_updated_at` is the field to poll on.
 *
 * ```ts
 * const shipment = await shiphero.inboundShipments.create({
 *   warehouse_id: warehouseId,
 *   purchase_order_ids: [po.id!],
 *   estimated_truck_arrival: '2026-08-04T09:00:00Z'
 * });
 *
 * const completed = await shiphero.inboundShipments.completedSince(lastRun);
 * ```
 */
export default class InboundShipments extends BaseResource {
  private readonly selection = inboundShipmentWithPurchaseOrders();

  get(args: InboundShipmentQueryArgs, options: GetOptions = {}): Promise<InboundShipment | null> {
    return this.fetchObject<InboundShipment>('inbound_shipment', args, this.selection, options);
  }

  page(
    args: InboundShipmentsQueryArgs = {},
    options: PageOptions = {}
  ): Promise<Page<InboundShipment>> {
    return this.fetchPage<InboundShipment>('inbound_shipments', args, INBOUND_SHIPMENT, options);
  }

  pages(args: InboundShipmentsQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<InboundShipment>('inbound_shipments', args, INBOUND_SHIPMENT, options);
  }

  /** Headers only. Nesting purchase orders here multiplies the credit estimate. */
  listAll(
    args: InboundShipmentsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InboundShipment[]> {
    return this.collect<InboundShipment>('inbound_shipments', args, INBOUND_SHIPMENT, options);
  }

  /** Inbound shipments with the purchase orders and line items they carry. */
  listAllWithPurchaseOrders(
    args: InboundShipmentsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InboundShipment[]> {
    return this.collect<InboundShipment>('inbound_shipments', args, this.selection, options);
  }

  /** Inbound shipments currently in one of the given statuses. */
  listByStatus(
    statuses: InboundShipmentStatus[],
    args: InboundShipmentsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InboundShipment[]> {
    return this.listAll({ ...args, statuses }, options);
  }

  /**
   * Shipments whose status moved to `COMPLETED` at or after `since`, i.e. everything
   * the warehouse has finished receiving. This is the signal to close out the
   * corresponding transfer or purchase order upstream.
   */
  completedSince(
    since: Date | string,
    args: InboundShipmentsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InboundShipment[]> {
    return this.listAllWithPurchaseOrders(
      { ...args, statuses: ['COMPLETED'], status_updated_at_from: toISO(since) },
      options
    );
  }

  /** What was received against a shipment, grouped by pallet or box. */
  summary(
    inboundShipmentId: string,
    options: GetOptions = {}
  ): Promise<InboundShipmentSummaryData | null> {
    return this.fetchObject<InboundShipmentSummaryData>(
      'inbound_shipment_summary',
      { inbound_shipment_id: inboundShipmentId },
      INBOUND_SHIPMENT_SUMMARY,
      options
    );
  }

  /** Where the received stock was put away, by bin. */
  locationSummary(
    inboundShipmentId: string,
    options: GetOptions = {}
  ): Promise<InboundShipmentLocationSummaryData | null> {
    return this.fetchObject<InboundShipmentLocationSummaryData>(
      'inbound_shipment_location_summary',
      { inbound_shipment_id: inboundShipmentId },
      INBOUND_SHIPMENT_LOCATION_SUMMARY,
      options
    );
  }

  create(data: CreateInboundShipmentInput, options: MutateOptions = {}): Promise<InboundShipment> {
    return this.runMutation<InboundShipment>(
      'inbound_shipment_create',
      { data },
      options.selection ?? INBOUND_SHIPMENT,
      options
    );
  }

  /**
   * Updates an inbound shipment. Note that `warehouse_id` and `purchase_orders_ids`
   * are required by ShipHero even when unchanged, and the field is spelled
   * `purchase_orders_ids` on update but `purchase_order_ids` on create.
   */
  update(data: UpdateInboundShipmentInput, options: MutateOptions = {}): Promise<InboundShipment> {
    return this.runMutation<InboundShipment>(
      'inbound_shipment_update',
      { data },
      options.selection ?? INBOUND_SHIPMENT,
      options
    );
  }
}
