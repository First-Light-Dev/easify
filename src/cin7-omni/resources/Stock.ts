import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, whereValue } from './base/Resource';
import { Stock as StockUnit, StockSchema } from './types/Stock';

/** https://api.cin7.com/api/Help#Stock */
export default class Stock extends ReadableResource<typeof StockSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Stock', StockSchema, options);
  }

  /** Fetches the stock records for a barcode, one per branch holding it. */
  async getByBarcode(barcode: string, options: QueryOptions = {}): Promise<StockUnit[]> {
    return this.listAll({ ...options, where: `barcode=${whereValue(barcode)}` });
  }

  /** Fetches the stock records for a SKU, one per branch holding it. */
  async getByCode(code: string, options: QueryOptions = {}): Promise<StockUnit[]> {
    return this.listAll({ ...options, where: `code=${whereValue(code)}` });
  }

  /** Fetches every stock record held in a branch. */
  async getByBranchId(branchId: number, options: QueryOptions = {}): Promise<StockUnit[]> {
    return this.listAll({ ...options, where: `branchId=${branchId}` });
  }
}
