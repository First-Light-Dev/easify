export interface CreditNote {
    id: number;
    reference: string;
    salesReference: string;
    createdDate: string;
    modifiedDate: string;
  
    lineItems: Array<CreditNoteItem>;
  
    memberEmail: string;
  
    // Money Related
    invoiceDate: string;
    discountTotal: number;
    discountDescription: string;
    freightTotal: number;
    freightDescription: string;
    total: number;
    branchId: number;
  
    isApproved: boolean;
  
    internalComments: string;
    surcharge: number;
    surchargeDescription: string;
  }
  
  export interface CreditNoteItem {
    code?: string;
    name?: string;
    productOptionId?: number;
    lineComments?: string;
    qty: number;
    option1?: string;
    option2?: string;
    option3?: string;
    unitPrice: number;
    discount: number;
    qtyShipped?: number;
  }
  
  export interface CreditNoteStockReceipt {
    id: string;
    lines: {
      sku: string;
      barcode: string;
      qty: number;
      batch: string;
    }[];
  }