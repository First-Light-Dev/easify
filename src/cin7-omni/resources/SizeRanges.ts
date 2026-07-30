import { AxiosInstance } from 'axios';
import { ReadableResource, ResourceOptions } from './base/Resource';
import { SizeRangeSchema } from './types/SizeRanges';

/**
 * https://api.cin7.com/api/Help#SizeRanges
 *
 * Read-only. The list endpoint returns every size range and takes no query parameters.
 */
export default class SizeRanges extends ReadableResource<typeof SizeRangeSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/SizeRanges', SizeRangeSchema, options);
  }
}
