import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { DeleteResult } from './types/Common';
import { Payment, PaymentCreateSchema, PaymentSchema, PaymentUpdateSchema } from './types/Payments';

/** https://api.cin7.com/api/Help#Payments */
export default class Payments extends WritableResource<
  typeof PaymentSchema,
  typeof PaymentCreateSchema,
  typeof PaymentUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Payments', PaymentSchema, PaymentCreateSchema, PaymentUpdateSchema, options);
  }

  /** Fetches every payment recorded against the given order. */
  async getByOrderId(orderId: number, options: QueryOptions = {}): Promise<Payment[]> {
    return this.listAll({ ...options, where: `orderId=${orderId}` });
  }

  /** Fetches every payment recorded against any of the given orders. */
  async getByOrderIds(orderIds: number[], options: QueryOptions = {}): Promise<Payment[]> {
    if (!orderIds.length) return [];
    return this.listAll({ ...options, where: orderIds.map((id) => `orderId=${id}`).join(' OR ') });
  }

  /** Fetches every payment recorded against any of the given order references. */
  async getByOrderRefs(orderRefs: string[], options: QueryOptions = {}): Promise<Payment[]> {
    if (!orderRefs.length) return [];
    const clause = orderRefs.map((ref) => `orderRef=${whereValue(ref)}`).join(' OR ');
    return this.listAll({ ...options, where: clause });
  }

  /** Deletes a payment. */
  async delete(id: number | string): Promise<DeleteResult> {
    return this.deleteRecord(id);
  }
}
