import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "../types";
import Cin7 from "..";
export default class CreditNotes {
    private axios;
    private cin7;
    constructor(axios: AxiosInstance, cin7: Cin7);
    get(id: string): Promise<CreditNote | undefined>;
    getByOrderRefs(refs: string[]): Promise<CreditNote[]>;
    getByIds(ids: string[]): Promise<CreditNote[]>;
    search(query: string): Promise<CreditNote[]>;
    create(creditNote: Partial<CreditNote>): Promise<string>;
    createBatch(creditNotes: Partial<CreditNote>[]): Promise<Array<APIUpsertResponse>>;
    update(creditNote: (Partial<CreditNote> & {
        id: number;
    })): Promise<string>;
    updateBatch(creditNotes: (Partial<CreditNote>)[]): Promise<Array<APIUpsertResponse>>;
    createStockReceipts(stockReceipts: CreditNoteStockReceipt[]): Promise<Array<{
        success: boolean;
        error: string;
    }>>;
    voidCreditNotes(creditNoteIds: string[]): Promise<Array<{
        success: boolean;
        error: string;
    }>>;
    getInternalCommentsData<T extends Record<string, string>>(creditNote: CreditNote, separator?: string): T;
    getInternalCommentStr<T extends Record<string, string>>(data: T, separator?: string): string;
}
export interface CreditNote {
    id: number;
    reference: string;
    salesReference: string;
    createdDate: string;
    modifiedDate: string;
    lineItems: Array<CreditNoteItem>;
    memberEmail: string;
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
    code: string;
    name: string;
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
    branchId: string;
    branchName: string;
    lines: {
        sku: string;
        qty: number;
        batch: string;
    }[];
}
