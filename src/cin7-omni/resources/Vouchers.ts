import { AxiosInstance } from 'axios';
import { ReadableResource, ResourceOptions } from './base/Resource';
import { Voucher, VoucherSchema } from './types/Vouchers';

/** https://api.cin7.com/api/Help#Voucher */
export default class Vouchers extends ReadableResource<typeof VoucherSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Voucher', VoucherSchema, options);
  }

  /** Fetches the voucher with the given code. */
  async getByCode(code: string): Promise<Voucher | undefined> {
    const response = await this.axios.get(this.path, { params: { code } });
    const [voucher] = this.parseMany(response.data);
    return voucher;
  }
}
