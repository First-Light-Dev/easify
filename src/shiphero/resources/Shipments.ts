import type { CreateShipmentInput, CreateShippingLabelInput } from '../generated/inputs';
import type { Shipment, ShippingLabel } from '../generated/objects';
import type { ShipmentQueryArgs, ShipmentsQueryArgs } from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import { SHIPPING_LABEL, shipment } from './base/selections';

/**
 * Outbound shipments and their labels, i.e. what actually left the warehouse.
 *
 * ```ts
 * const shipped = await shiphero.shipments.since(lastRun);
 * ```
 */
export default class Shipments extends BaseResource {
  private readonly selection = shipment();

  get(args: ShipmentQueryArgs, options: GetOptions = {}): Promise<Shipment | null> {
    return this.fetchObject<Shipment>('shipment', args, this.selection, options);
  }

  page(args: ShipmentsQueryArgs = {}, options: PageOptions = {}): Promise<Page<Shipment>> {
    return this.fetchPage<Shipment>('shipments', args, this.selection, options);
  }

  pages(args: ShipmentsQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<Shipment>('shipments', args, this.selection, options);
  }

  listAll(args: ShipmentsQueryArgs = {}, options: ListAllOptions = {}): Promise<Shipment[]> {
    return this.collect<Shipment>('shipments', args, this.selection, options);
  }

  /** Shipments created at or after `since`. */
  since(
    from: Date | string,
    args: ShipmentsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Shipment[]> {
    return this.listAll({ ...args, date_from: toISO(from) }, options);
  }

  /** Shipments for one order. */
  forOrder(orderId: string, options: ListAllOptions = {}): Promise<Shipment[]> {
    return this.listAll({ order_id: orderId }, options);
  }

  create(data: CreateShipmentInput, options: MutateOptions = {}): Promise<Shipment> {
    return this.runMutation<Shipment>(
      'shipment_create',
      { data },
      options.selection ?? this.selection,
      options
    );
  }

  createShippingLabel(
    data: CreateShippingLabelInput,
    options: MutateOptions = {}
  ): Promise<ShippingLabel> {
    return this.runMutation<ShippingLabel>(
      'shipment_create_shipping_label',
      { data },
      options.selection ?? SHIPPING_LABEL,
      options
    );
  }
}
