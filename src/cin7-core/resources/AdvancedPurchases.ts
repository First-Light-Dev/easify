import { AxiosInstance } from 'axios';
import { NestedDocumentResource, QueryOptions, ResourceOptions } from './base/Resource';
import {
  AdvancedPurchaseCreditNote,
  AdvancedPurchaseCreditNoteSchema,
  AdvancedPurchaseInvoice,
  AdvancedPurchaseInvoiceSchema,
  AdvancedPurchaseManualJournal,
  AdvancedPurchaseManualJournalSchema,
  AdvancedPurchasePayment,
  AdvancedPurchasePaymentSchema,
  AdvancedPurchasePutAway,
  AdvancedPurchasePutAwaySchema,
  AdvancedPurchaseStock,
  AdvancedPurchaseStockLine,
  AdvancedPurchaseStockSchema,
  AdvancedPurchaseStockTask,
  AdvancedPurchaseStockUpsert
} from './types/AdvancedPurchases';

/**
 * https://dearinventory.docs.apiary.io/#reference/purchase/advanced-purchase
 *
 * Advanced purchases split receiving, invoicing and crediting into multiple tasks per
 * purchase, unlike the simple `/purchase/*` endpoints which allow one of each.
 * Calling POST or PUT here converts a simple purchase into an advanced one.
 */
export default class AdvancedPurchases {
  readonly stock: NestedDocumentResource<typeof AdvancedPurchaseStockSchema>;
  readonly putAway: NestedDocumentResource<typeof AdvancedPurchasePutAwaySchema>;
  readonly invoice: NestedDocumentResource<typeof AdvancedPurchaseInvoiceSchema>;
  readonly creditNote: NestedDocumentResource<typeof AdvancedPurchaseCreditNoteSchema>;
  readonly payment: NestedDocumentResource<typeof AdvancedPurchasePaymentSchema>;
  readonly manualJournal: NestedDocumentResource<typeof AdvancedPurchaseManualJournalSchema>;

  constructor(
    private readonly axios: AxiosInstance,
    private readonly options: ResourceOptions = {}
  ) {
    this.stock = new NestedDocumentResource(
      axios,
      '/advanced-purchase/stock',
      AdvancedPurchaseStockSchema,
      'PurchaseID',
      options
    );
    this.putAway = new NestedDocumentResource(
      axios,
      '/advanced-purchase/put-away',
      AdvancedPurchasePutAwaySchema,
      'PurchaseID',
      options
    );
    this.invoice = new NestedDocumentResource(
      axios,
      '/advanced-purchase/invoice',
      AdvancedPurchaseInvoiceSchema,
      'PurchaseID',
      options
    );
    this.creditNote = new NestedDocumentResource(
      axios,
      '/advanced-purchase/creditnote',
      AdvancedPurchaseCreditNoteSchema,
      'PurchaseID',
      options
    );
    this.payment = new NestedDocumentResource(
      axios,
      '/advanced-purchase/payment',
      AdvancedPurchasePaymentSchema,
      'PurchaseID',
      options
    );
    this.manualJournal = new NestedDocumentResource(
      axios,
      '/advanced-purchase/manualJournal',
      AdvancedPurchaseManualJournalSchema,
      'PurchaseID',
      options
    );
  }

  /** Creates an advanced purchase (or converts a simple one). */
  async create(body: unknown, params: QueryOptions = {}): Promise<unknown> {
    const response = await this.axios.post('/advanced-purchase', body, { params });
    return response.data;
  }

  /** Updates an advanced purchase. */
  async update(body: unknown, params: QueryOptions = {}): Promise<unknown> {
    const response = await this.axios.put('/advanced-purchase', body, { params });
    return response.data;
  }

  /** Deletes or voids an advanced purchase. */
  async delete(purchaseId: string, params: QueryOptions = {}): Promise<unknown> {
    const response = await this.axios.delete('/advanced-purchase', {
      params: { ...params, ID: purchaseId }
    });
    return response.data;
  }

  /** Every stock-receiving task recorded against a purchase. */
  async getStockReceipts(purchaseId: string): Promise<AdvancedPurchaseStockTask[]> {
    const receipt = await this.stock.get(purchaseId);
    return receipt.StockReceiving ?? [];
  }

  /**
   * Records a receipt against a purchase. Omit `TaskID` to add a new receiving task,
   * or pass one to amend an existing task.
   */
  async receiveStock(
    receipt: AdvancedPurchaseStockUpsert,
    params: QueryOptions = {}
  ): Promise<AdvancedPurchaseStock> {
    const method = receipt.TaskID ? 'put' : 'post';
    return method === 'put'
      ? this.stock.update(receipt, params)
      : this.stock.create(receipt, params);
  }

  /**
   * Convenience wrapper for the 3PL receipt flow: posts an authorised receipt for the
   * given lines, stamping each with the date the warehouse received them.
   */
  async receiveAuthorised(
    purchaseId: string,
    lines: AdvancedPurchaseStockLine[],
    receivedDate?: Date | string
  ): Promise<AdvancedPurchaseStock> {
    const date =
      receivedDate instanceof Date
        ? receivedDate.toISOString()
        : (receivedDate ?? new Date().toISOString());

    return this.receiveStock({
      PurchaseID: purchaseId,
      Status: 'AUTHORISED',
      Lines: lines.map((line) => ({ Date: date, ...line }))
    });
  }

  /** True when every receiving task on the purchase is authorised. */
  async isFullyReceived(purchaseId: string): Promise<boolean> {
    const receipts = await this.getStockReceipts(purchaseId);
    return receipts.length > 0 && receipts.every((task) => task.Status === 'AUTHORISED');
  }
}

export type {
  AdvancedPurchaseStock,
  AdvancedPurchaseStockTask,
  AdvancedPurchaseStockLine,
  AdvancedPurchaseStockUpsert,
  AdvancedPurchasePutAway,
  AdvancedPurchaseInvoice,
  AdvancedPurchaseCreditNote,
  AdvancedPurchasePayment,
  AdvancedPurchaseManualJournal
};
