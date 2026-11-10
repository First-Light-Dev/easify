import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { UpsertResult } from './types/Common';
import {
  SalesOrder,
  SalesOrderCreateSchema,
  SalesOrderSchema,
  SalesOrderUpdateSchema
} from './types/SalesOrders';

/** https://api.cin7.com/api/Help#SalesOrders */
export default class SalesOrders extends WritableResource<
  typeof SalesOrderSchema,
  typeof SalesOrderCreateSchema,
  typeof SalesOrderUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/SalesOrders',
      SalesOrderSchema,
      SalesOrderCreateSchema,
      SalesOrderUpdateSchema,
      options
    );
  }

  /** Fetches the order carrying the given unique reference. */
  async getByReference(reference: string): Promise<SalesOrder | undefined> {
    const [order] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return order;
  }

  /** Fetches every order whose reference is in the given list. */
  async getByReferences(references: string[], options: QueryOptions = {}): Promise<SalesOrder[]> {
    if (!references.length) return [];
    const clause = references.map((reference) => `reference=${whereValue(reference)}`).join(' OR ');
    return this.listAll({ ...options, where: clause });
  }

  /** Fetches every order placed by the given CRM contact. */
  async getByMemberId(memberId: number, options: QueryOptions = {}): Promise<SalesOrder[]> {
    return this.listAll({ ...options, where: `memberId=${memberId}` });
  }

  /**
   * Voids an order. Cin7 documents this as irreversible, so there is no matching unvoid.
   */
  async void(id: number): Promise<UpsertResult> {
    return this.update({ id, isVoid: true });
  }

  /**
   * Moves an order to a new stage, e.g. `New`, `Awaiting Payment`, `Dispatched`, `On Hold`.
   */
  async setStage(id: number, stage: string): Promise<UpsertResult> {
    return this.update({ id, stage });
  }
}
