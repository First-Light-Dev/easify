import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  CreditNote,
  CreditNoteCreateSchema,
  CreditNoteSchema,
  CreditNoteUpdateSchema
} from './types/CreditNotes';

/** https://api.cin7.com/api/Help#CreditNotes */
export default class CreditNotes extends WritableResource<
  typeof CreditNoteSchema,
  typeof CreditNoteCreateSchema,
  typeof CreditNoteUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/CreditNotes',
      CreditNoteSchema,
      CreditNoteCreateSchema,
      CreditNoteUpdateSchema,
      options
    );
  }

  /** Fetches the credit note carrying the given unique reference. */
  async getByReference(reference: string): Promise<CreditNote | undefined> {
    const [creditNote] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return creditNote;
  }

  /** Fetches every credit note linked to the given sales order reference. */
  async getBySalesReference(
    salesReference: string,
    options: QueryOptions = {}
  ): Promise<CreditNote[]> {
    return this.listAll({
      ...options,
      where: `salesReference=${whereValue(salesReference)}`
    });
  }

  /** Fetches every credit note linked to any of the given sales order references. */
  async getBySalesReferences(
    salesReferences: string[],
    options: QueryOptions = {}
  ): Promise<CreditNote[]> {
    if (!salesReferences.length) return [];
    const clause = salesReferences
      .map((reference) => `salesReference=${whereValue(reference)}`)
      .join(' OR ');
    return this.listAll({ ...options, where: clause });
  }

  /** Fetches every credit note raised against the given CRM contact. */
  async getByMemberId(memberId: number, options: QueryOptions = {}): Promise<CreditNote[]> {
    return this.listAll({ ...options, where: `memberId=${memberId}` });
  }
}
