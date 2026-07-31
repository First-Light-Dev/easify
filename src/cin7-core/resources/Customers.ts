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
    super(axios, '/customer', CustomerSchema, 'CustomerList', options);
    this.credits = new ReadableResource(
      axios,
      '/ref/customer/credits',
      CustomerCreditsSchema,
      'CustomerCreditsList',
      options
    );
  }

  async getByName(name: string, params: QueryOptions = {}): Promise<Customer[]> {
    return this.listAll({ ...params, Name: name });
  }
}

export type { Customer, CustomerCredits };
