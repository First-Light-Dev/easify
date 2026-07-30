import { AxiosInstance } from 'axios';
import { z } from 'zod';
import { BaseResource, ResourceOptions } from './base/Resource';
import { Carton, CartonSchema, CartonUpdate, CartonUpdateSchema } from './types/Cartons';

/**
 * https://api.cin7.com/api/Help#Cartons
 *
 * Cartons hang off a sales order rather than having ids of their own, so both endpoints are
 * addressed by sales order id and the whole set is replaced on write.
 */
export default class Cartons extends BaseResource<typeof CartonSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Cartons', CartonSchema, options);
  }

  /** Fetches every carton recorded against a sales order. */
  async getBySalesOrderId(salesOrderId: number | string): Promise<Carton[]> {
    const response = await this.axios.get(`${this.path}/${salesOrderId}`);
    return this.parseMany(response.data);
  }

  /**
   * Replaces the full list of cartons on a sales order. Returns true when Cin7 accepts it.
   */
  async replace(salesOrderId: number | string, cartons: CartonUpdate[]): Promise<boolean> {
    const payload =
      this.options.validate === false
        ? cartons
        : cartons.map((carton) => CartonUpdateSchema.parse(carton));

    const response = await this.axios.put(`${this.path}/${salesOrderId}`, payload);
    return z.boolean().catch(false).parse(response.data);
  }
}
