import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  BranchTransfer,
  BranchTransferCreateSchema,
  BranchTransferSchema,
  BranchTransferUpdateSchema
} from './types/BranchTransfers';

/** https://api.cin7.com/api/Help#BranchTransfers */
export default class BranchTransfers extends WritableResource<
  typeof BranchTransferSchema,
  typeof BranchTransferCreateSchema,
  typeof BranchTransferUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/BranchTransfers',
      BranchTransferSchema,
      BranchTransferCreateSchema,
      BranchTransferUpdateSchema,
      options
    );
  }

  /** Fetches the transfer carrying the given unique reference. */
  async getByReference(reference: string): Promise<BranchTransfer | undefined> {
    const [transfer] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return transfer;
  }

  /** Fetches every transfer sent from the given branch. */
  async getBySourceBranchId(branchId: number, options: QueryOptions = {}) {
    return this.listAll({ ...options, where: `sourceBranchId=${branchId}` });
  }

  /** Fetches every transfer sent to the given branch. */
  async getByDestinationBranchId(branchId: number, options: QueryOptions = {}) {
    return this.listAll({ ...options, where: `destinationBranchId=${branchId}` });
  }
}
