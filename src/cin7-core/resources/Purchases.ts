import { AxiosInstance } from 'axios';
import { z } from 'zod';
import {
  NestedDocumentResource,
  PageResult,
  QueryOptions,
  ReadableResource,
  ResourceOptions,
  WritableResource
} from './base/Resource';
import {
  Purchase,
  PurchaseCreditNote,
  PurchaseCreditNoteList,
  PurchaseCreditNoteListSchema,
  PurchaseCreditNoteSchema,
  PurchaseInvoice,
  PurchaseInvoiceSchema,
  PurchaseList,
  PurchaseListSchema,
  PurchaseOrder,
  PurchaseOrderSchema,
  PurchasePayments,
  PurchasePaymentsSchema,
  PurchaseSchema
} from './types/Purchases';

/** Stock-received document; the blueprint model is thin so keep it open. */
const PurchaseStockSchema = z.looseObject({
  TaskID: z.string().nullable().optional(),
  Status: z.string().nullable().optional(),
  Lines: z.array(z.unknown()).nullable().optional()
});

type PurchaseStock = z.infer<typeof PurchaseStockSchema>;

/** https://dearinventory.docs.apiary.io/#reference/purchase */
export default class Purchases extends WritableResource<typeof PurchaseSchema> {
  readonly listView: ReadableResource<typeof PurchaseListSchema>;
  readonly creditNoteList: ReadableResource<typeof PurchaseCreditNoteListSchema>;
  readonly order: NestedDocumentResource<typeof PurchaseOrderSchema>;
  readonly stock: NestedDocumentResource<typeof PurchaseStockSchema>;
  readonly invoice: NestedDocumentResource<typeof PurchaseInvoiceSchema>;
  readonly creditNote: NestedDocumentResource<typeof PurchaseCreditNoteSchema>;
  readonly payment: NestedDocumentResource<typeof PurchasePaymentsSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/purchase', PurchaseSchema, 'PurchaseList', { ...options, sinceParam: 'UpdatedSince' });

    this.listView = new ReadableResource(
      axios,
      '/purchaseList',
      PurchaseListSchema,
      'PurchaseList',
      { ...options, sinceParam: 'UpdatedSince' }
    );
    this.creditNoteList = new ReadableResource(
      axios,
      '/purchaseCreditNoteList',
      PurchaseCreditNoteListSchema,
      'PurchaseCreditNoteList',
      { ...options, sinceParam: 'UpdatedSince' }
    );
    this.order = new NestedDocumentResource(
      axios,
      '/purchase/order',
      PurchaseOrderSchema,
      'TaskID',
      options
    );
    this.stock = new NestedDocumentResource(
      axios,
      '/purchase/stock',
      PurchaseStockSchema,
      'TaskID',
      options
    );
    this.invoice = new NestedDocumentResource(
      axios,
      '/purchase/invoice',
      PurchaseInvoiceSchema,
      'TaskID',
      options
    );
    this.creditNote = new NestedDocumentResource(
      axios,
      '/purchase/creditnote',
      PurchaseCreditNoteSchema,
      'TaskID',
      options
    );
    this.payment = new NestedDocumentResource(
      axios,
      '/purchase/payment',
      PurchasePaymentsSchema,
      'TaskID',
      options
    );
  }

  override async list(params: QueryOptions = {}): Promise<PageResult<PurchaseList>> {
    return this.listView.list(params);
  }

  override async listAll(params: QueryOptions = {}): Promise<PurchaseList[]> {
    return this.listView.listAll(params);
  }

  override async *pages(
    params: QueryOptions = {}
  ): AsyncGenerator<PageResult<PurchaseList>, void, void> {
    yield* this.listView.pages(params);
  }

  async getById(id: string, params: QueryOptions = {}): Promise<Purchase> {
    return this.get(id, params);
  }

  async void(id: string): Promise<unknown> {
    return this.delete(id, { Void: true });
  }

  /** Purchases whose order has been authorised, optionally changed since a date. */
  async listAuthorised(params: QueryOptions = {}): Promise<PurchaseList[]> {
    return this.listAll({ OrderStatus: 'AUTHORISED', ...params });
  }

  /**
   * Authorised purchases stocked into a given location, e.g. `US 3PL Warehouse`.
   *
   * `/purchaseList` does not expose the header location, so this fetches the detail for
   * each candidate and filters on `Purchase.Location`. Narrow the candidate set with
   * `UpdatedSince` to keep the number of detail calls low — Cin7 Core allows 60 calls
   * per minute.
   */
  async listAuthorisedByLocation(
    location: string,
    params: QueryOptions = {}
  ): Promise<Purchase[]> {
    const candidates = await this.listAuthorised(params);
    const matches: Purchase[] = [];

    for (const candidate of candidates) {
      if (!candidate.ID) continue;
      const purchase = await this.getById(candidate.ID);
      if (purchase.Location === location) matches.push(purchase);
    }
    return matches;
  }
}

export type {
  Purchase,
  PurchaseList,
  PurchaseOrder,
  PurchaseStock,
  PurchaseInvoice,
  PurchaseCreditNote,
  PurchaseCreditNoteList,
  PurchasePayments
};
