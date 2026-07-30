import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, whereValue } from './base/Resource';
import { SerialNumber, SerialNumberSchema } from './types/SerialNumbers';

/** https://api.cin7.com/api/Help#SerialNumbers */
export default class SerialNumbers extends ReadableResource<typeof SerialNumberSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/SerialNumbers', SerialNumberSchema, options);
  }

  /** Fetches the record for a specific serial number. */
  async getBySerialNumber(serialNumber: string): Promise<SerialNumber | undefined> {
    const [record] = await this.list({
      where: `serialnumber=${whereValue(serialNumber)}`,
      rows: 1
    });
    return record;
  }

  /** Fetches every serial number recorded against a product option. */
  async getByProductOptionId(
    productOptionId: number,
    options: QueryOptions = {}
  ): Promise<SerialNumber[]> {
    return this.listAll({ ...options, where: `productOptionId=${productOptionId}` });
  }
}
