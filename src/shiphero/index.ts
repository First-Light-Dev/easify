import { ShipHeroClient, ShipHeroConfig } from './client';

import Account from './resources/Account';
import InboundShipments from './resources/InboundShipments';
import Inventory from './resources/Inventory';
import Locations from './resources/Locations';
import Orders from './resources/Orders';
import Products from './resources/Products';
import PurchaseOrders from './resources/PurchaseOrders';
import Returns from './resources/Returns';
import Shipments from './resources/Shipments';
import Vendors from './resources/Vendors';
import Webhooks from './resources/Webhooks';

/**
 * A client for the ShipHero public GraphQL API
 * (https://developer.shiphero.com/).
 *
 * ```ts
 * const shiphero = new ShipHero({
 *   auth: { accessToken: '...', refreshToken: '...' },
 *   options: { customerAccountId: 'QWNjb3VudDoxMjM0' }
 * });
 *
 * const warehouse = await shiphero.account.warehouseByIdentifier('US 3PL Warehouse');
 * const products = await shiphero.products.updatedSince(lastRun);
 * ```
 *
 * Operations not covered by a resource are still reachable through
 * {@link ShipHeroClient.query} and {@link ShipHeroClient.mutate}, which share the same
 * auth and throttling behaviour.
 */
export class ShipHero extends ShipHeroClient {
  readonly account: Account;
  readonly products: Products;
  readonly inventory: Inventory;
  readonly purchaseOrders: PurchaseOrders;
  readonly inboundShipments: InboundShipments;
  readonly orders: Orders;
  readonly shipments: Shipments;
  readonly returns: Returns;
  readonly vendors: Vendors;
  readonly locations: Locations;
  readonly webhooks: Webhooks;

  constructor(config: ShipHeroConfig) {
    super(config);

    this.account = new Account(this);
    this.products = new Products(this);
    this.inventory = new Inventory(this);
    this.purchaseOrders = new PurchaseOrders(this);
    this.inboundShipments = new InboundShipments(this);
    this.orders = new Orders(this);
    this.shipments = new Shipments(this);
    this.returns = new Returns(this);
    this.vendors = new Vendors(this);
    this.locations = new Locations(this);
    this.webhooks = new Webhooks(this);
  }
}

export default ShipHero;

export {
  Account,
  InboundShipments,
  Inventory,
  Locations,
  Orders,
  Products,
  PurchaseOrders,
  Returns,
  Shipments,
  Vendors,
  Webhooks
};

export * from './client';
export * from './errors';
export * from './resources/base/Resource';
export * as selections from './resources/base/selections';
export * from './generated';

export type { PurchaseOrderReceipt, PurchaseOrderReceiptLine } from './resources/PurchaseOrders';
export type { OrderPickProgress } from './resources/Orders';
export type { AdjustmentPollOptions } from './resources/Inventory';
export { INVENTORY_CHANGE_MAX_WINDOW_DAYS } from './resources/Inventory';
