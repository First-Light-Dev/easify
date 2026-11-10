import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions } from './base/Resource';
import { BomMasterSchema, BomMasterV2, BomMasterV2Schema } from './types/BomMasters';

/**
 * https://api.cin7.com/api/Help#BomMasters
 *
 * Read-only. The v2 endpoint returns a richer representation and is exposed through the
 * `getV2` and `listV2` methods.
 */
export default class BomMasters extends ReadableResource<typeof BomMasterSchema> {
  private readonly v2Path = '/v2/BomMasters';

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/BomMasters', BomMasterSchema, options);
  }

  /** Fetches a single BOM master from the v2 endpoint. */
  async getV2(id: number | string): Promise<BomMasterV2> {
    const response = await this.axios.get(`${this.v2Path}/${id}`);
    if (this.options.validate === false) return response.data as BomMasterV2;
    return BomMasterV2Schema.parse(response.data);
  }

  /** Fetches a page of BOM masters from the v2 endpoint. */
  async listV2(options: QueryOptions = {}): Promise<BomMasterV2[]> {
    const response = await this.axios.get(this.v2Path, { params: options });
    if (!Array.isArray(response.data)) return [];
    if (this.options.validate === false) return response.data as BomMasterV2[];
    return response.data.map((item) => BomMasterV2Schema.parse(item));
  }
}
