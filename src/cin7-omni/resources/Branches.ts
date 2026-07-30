import { AxiosInstance } from 'axios';
import { ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { Branch, BranchCreateSchema, BranchSchema, BranchUpdateSchema } from './types/Branches';

/** https://api.cin7.com/api/Help#Branches */
export default class Branches extends WritableResource<
  typeof BranchSchema,
  typeof BranchCreateSchema,
  typeof BranchUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Branches', BranchSchema, BranchCreateSchema, BranchUpdateSchema, options);
  }

  /** Fetches the branch with the given company name. */
  async getByCompany(company: string): Promise<Branch | undefined> {
    const [branch] = await this.list({ where: `company=${whereValue(company)}`, rows: 1 });
    return branch;
  }

  /** Fetches every branch that has not been deactivated. */
  async listActive(): Promise<Branch[]> {
    return this.listAll({ where: 'isActive=1' });
  }
}
