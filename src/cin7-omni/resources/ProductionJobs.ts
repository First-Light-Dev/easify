import { AxiosInstance } from 'axios';
import { ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  ProductionJob,
  ProductionJobCreateSchema,
  ProductionJobSchema,
  ProductionJobUpdateSchema
} from './types/ProductionJobs';

/** https://api.cin7.com/api/Help#ProductionJobs */
export default class ProductionJobs extends WritableResource<
  typeof ProductionJobSchema,
  typeof ProductionJobCreateSchema,
  typeof ProductionJobUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/ProductionJobs',
      ProductionJobSchema,
      ProductionJobCreateSchema,
      ProductionJobUpdateSchema,
      options
    );
  }

  /** Fetches the production job carrying the given unique reference. */
  async getByReference(reference: string): Promise<ProductionJob | undefined> {
    const [job] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return job;
  }
}
