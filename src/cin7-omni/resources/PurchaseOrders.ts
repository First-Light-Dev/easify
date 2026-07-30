import { AxiosInstance } from 'axios';
import { ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  PurchaseOrder,
  PurchaseOrderCreateSchema,
  PurchaseOrderSchema,
  PurchaseOrderUpdateSchema
} from './types/PurchaseOrders';

/**
 * https://api.cin7.com/api/Help#PurchaseOrders
 *
 * The create and update endpoints accept a `loadboms` flag, passed as the second argument:
 * `purchaseOrders.create(order, { loadboms: true })`.
 */
export default class PurchaseOrders extends WritableResource<
  typeof PurchaseOrderSchema,
  typeof PurchaseOrderCreateSchema,
  typeof PurchaseOrderUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/PurchaseOrders',
      PurchaseOrderSchema,
      PurchaseOrderCreateSchema,
      PurchaseOrderUpdateSchema,
      options
    );
  }

  /** Fetches the purchase order carrying the given unique reference. */
  async getByReference(reference: string): Promise<PurchaseOrder | undefined> {
    const [order] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return order;
  }
}
