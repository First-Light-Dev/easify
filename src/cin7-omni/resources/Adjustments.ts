import { AxiosInstance } from 'axios';
import { ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  Adjustment,
  AdjustmentCreateSchema,
  AdjustmentSchema,
  AdjustmentUpdateSchema
} from './types/Adjustments';

/** https://api.cin7.com/api/Help#Adjustments */
export default class Adjustments extends WritableResource<
  typeof AdjustmentSchema,
  typeof AdjustmentCreateSchema,
  typeof AdjustmentUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/Adjustments',
      AdjustmentSchema,
      AdjustmentCreateSchema,
      AdjustmentUpdateSchema,
      options
    );
  }

  /** Fetches the adjustment carrying the given unique reference. */
  async getByReference(reference: string): Promise<Adjustment | undefined> {
    const [adjustment] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return adjustment;
  }
}
