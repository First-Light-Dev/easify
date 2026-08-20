import { AxiosInstance } from 'axios';
import {
  NestedDocumentResource,
  PageResult,
  QueryOptions,
  ReadableResource,
  ResourceOptions,
  WritableResource
} from './base/Resource';
import {
  Sale,
  SaleCreditNoteList,
  SaleCreditNoteListSchema,
  SaleFulfilment,
  SaleFulfilmentSchema,
  SaleInvoice,
  SaleInvoiceSchema,
  SaleList,
  SaleListSchema,
  SaleOrder,
  SaleOrderSchema,
  SalePaymentLine,
  SalePaymentLineSchema,
  SaleQuote,
  SaleQuoteSchema,
  SaleSchema
} from './types/Sales';

/** https://dearinventory.docs.apiary.io/#reference/sale */
export default class Sales extends WritableResource<typeof SaleSchema> {
  /** Paginated sale summaries via `/saleList`. */
  readonly listView: ReadableResource<typeof SaleListSchema>;
  /** Paginated credit-note summaries via `/saleCreditNoteList`. */
  readonly creditNoteList: ReadableResource<typeof SaleCreditNoteListSchema>;
  readonly quote: NestedDocumentResource<typeof SaleQuoteSchema>;
  readonly order: NestedDocumentResource<typeof SaleOrderSchema>;
  readonly fulfilment: NestedDocumentResource<typeof SaleFulfilmentSchema>;
  readonly invoice: NestedDocumentResource<typeof SaleInvoiceSchema>;
  readonly creditNote: NestedDocumentResource<typeof SaleCreditNoteListSchema>;
  readonly payment: NestedDocumentResource<typeof SalePaymentLineSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    // `/sale` is a detail/create/update endpoint; listing goes through `/saleList`.
    super(axios, '/sale', SaleSchema, 'SaleList', { ...options, sinceParam: 'UpdatedSince' });

    this.listView = new ReadableResource(axios, '/saleList', SaleListSchema, 'SaleList', { ...options, sinceParam: 'UpdatedSince' });
    this.creditNoteList = new ReadableResource(
      axios,
      '/saleCreditNoteList',
      SaleCreditNoteListSchema,
      // Verified against the live v2 API 2026-08-10: the blueprint's name is not what the
      // endpoint returns, and the old value made this list silently yield zero rows.
      'SaleList',
      { ...options, sinceParam: 'UpdatedSince' }
    );
    this.quote = new NestedDocumentResource(axios, '/sale/quote', SaleQuoteSchema, 'SaleID', options);
    this.order = new NestedDocumentResource(axios, '/sale/order', SaleOrderSchema, 'SaleID', options);
    this.fulfilment = new NestedDocumentResource(
      axios,
      '/sale/fulfilment',
      SaleFulfilmentSchema,
      'SaleID',
      options
    );
    this.invoice = new NestedDocumentResource(
      axios,
      '/sale/invoice',
      SaleInvoiceSchema,
      'SaleID',
      options
    );
    this.creditNote = new NestedDocumentResource(
      axios,
      '/sale/creditnote',
      SaleCreditNoteListSchema,
      'SaleID',
      options
    );
    this.payment = new NestedDocumentResource(
      axios,
      '/sale/payment',
      SalePaymentLineSchema,
      'SaleID',
      options
    );
  }

  /** Lists sales via `/saleList` (supports Search, Status, UpdatedSince, etc.). */
  override async list(params: QueryOptions = {}): Promise<PageResult<SaleList>> {
    return this.listView.list(params);
  }

  override async listAll(params: QueryOptions = {}): Promise<SaleList[]> {
    return this.listView.listAll(params);
  }

  override async *pages(
    params: QueryOptions = {}
  ): AsyncGenerator<PageResult<SaleList>, void, void> {
    yield* this.listView.pages(params);
  }

  /** Fetches the full sale document by id. */
  async getById(id: string, params: QueryOptions = {}): Promise<Sale> {
    return this.get(id, params);
  }

  /** Voids a sale. */
  async void(id: string): Promise<unknown> {
    return this.delete(id, { Void: true });
  }
}

export type {
  Sale,
  SaleList,
  SaleQuote,
  SaleOrder,
  SaleFulfilment,
  SaleInvoice,
  SaleCreditNoteList,
  SalePaymentLine
};
