import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource } from './base/Resource';
import { Supplier, SupplierSchema } from './types/Suppliers';

/** https://dearinventory.docs.apiary.io/#reference/supplier */
export default class Suppliers extends WritableResource<typeof SupplierSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/supplier', SupplierSchema, 'SupplierList', { ...options, sinceParam: 'ModifiedSince' });
  }

  async getByName(name: string, params: QueryOptions = {}): Promise<Supplier[]> {
    return this.listAll({ ...params, Name: name });
  }
}

export type { Supplier };
