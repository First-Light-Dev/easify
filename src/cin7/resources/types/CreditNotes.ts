export interface CreditNote {
    id: number;
    reference: string;
    salesReference: string;
    createdDate: string;
    modifiedDate: string;
    completedDate: string;
  
    lineItems: Array<CreditNoteItem>;
  
    memberEmail: string;
    memberId: number;
  
    // Money Related
    invoiceDate: string;
    discountTotal: number;
    discountDescription: string;
    freightTotal: number;
    freightDescription: string;
    total: number;
    branchId: number;
    accountingAttributes: {
      accountingImportStatus: string;
    };
    isApproved: boolean;
  
    internalComments: string;
    surcharge: number;
    surchargeDescription: string;
  }
  
  export interface CreditNoteItem {
    code?: string;
    name?: string;
    barcode?: string;
    lineComments?: string;
    qty: number;
    option1?: string;
    option2?: string;
    option3?: string;
    unitPrice: number;
    discount: number;
    sizeCodes?: string;
    qtyShipped?: number;
  }
  
  export interface CreditNoteStockReceipt {
    id: string;
    lines: {
      sku: string;
      barcode: string;
      restockQty: number;
      returnQty: number;
      batch: string;
    }[];
  }