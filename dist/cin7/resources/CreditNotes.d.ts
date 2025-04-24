import { AxiosInstance } from "axios";
import Cin7 from "..";
import { CreditNote, CreditNoteStockReceipt } from "./types/CreditNotes";
import { APIUpsertResponse } from "./types";
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
