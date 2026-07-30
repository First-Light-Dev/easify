import { AxiosInstance } from 'axios';
import { ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { Quote, QuoteCreateSchema, QuoteSchema, QuoteUpdateSchema } from './types/Quotes';

/**
 * https://api.cin7.com/api/Help#Quotes
 *
 * The create and update endpoints accept a `loadboms` flag, passed as the second argument:
 * `quotes.create(quote, { loadboms: true })`.
 */
export default class Quotes extends WritableResource<
  typeof QuoteSchema,
  typeof QuoteCreateSchema,
  typeof QuoteUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Quotes', QuoteSchema, QuoteCreateSchema, QuoteUpdateSchema, options);
  }

  /** Fetches the quote carrying the given unique reference. */
  async getByReference(reference: string): Promise<Quote | undefined> {
    const [quote] = await this.list({ where: `reference=${whereValue(reference)}`, rows: 1 });
    return quote;
  }
}
