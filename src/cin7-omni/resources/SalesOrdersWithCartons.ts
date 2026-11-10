import { AxiosInstance } from 'axios';
import { ReadableResource, ResourceOptions, whereValue } from './base/Resource';
import { SalesOrderWithCartons, SalesOrderWithCartonsSchema } from './types/SalesOrdersWithCartons';

/**
 * https://api.cin7.com/api/Help#SalesOrdersWithCartons
 *
 * The same sales orders as the SalesOrders resource, with carton details attached. Read-only;
 * write through SalesOrders and Cartons.
 */
export default class SalesOrdersWithCartons extends ReadableResource<
  typeof SalesOrderWithCartonsSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/SalesOrdersWithCartons', SalesOrderWithCartonsSchema, options);
  }

  /** Fetches the order carrying the given unique reference, with its cartons. */
  async getByReference(reference: string): Promise<SalesOrderWithCartons | undefined> {
    const [order] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return order;
  }
}
