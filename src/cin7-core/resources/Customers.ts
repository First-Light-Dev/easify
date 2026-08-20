import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, WritableResource } from './base/Resource';
import {
  Customer,
  CustomerCredits,
  CustomerCreditsSchema,
  CustomerSchema
} from './types/Customers';

/** https://dearinventory.docs.apiary.io/#reference/customer */
export default class Customers extends WritableResource<typeof CustomerSchema> {
  readonly credits: ReadableResource<typeof CustomerCreditsSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/customer', CustomerSchema, 'CustomerList', { ...options, sinceParam: 'ModifiedSince' });
    this.credits = new ReadableResource(
      axios,
      '/ref/customer/credits',
      CustomerCreditsSchema,
      // Verified against the live v2 API 2026-08-10: the blueprint's name is not what the
      // endpoint returns, and the old value made this list silently yield zero rows.
      'CustomerCredits',
      options
    );
  }

  async getByName(name: string, params: QueryOptions = {}): Promise<Customer[]> {
    return this.listAll({ ...params, Name: name });
  }
}

export type { Customer, CustomerCredits };
