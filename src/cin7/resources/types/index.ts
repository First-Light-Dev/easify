export interface APIUpsertResponse {
    index: number;
    success: boolean;
    id: number;
    code: string | null;
    errors: string[];
}

export interface APICallCounter {
    get(): Promise<{ [key: string]: number }>;
    increment(key: string): Promise<void>;
    reset(): Promise<void>
}


export * from "./CreditNotes";
export * from "./Payments";
export * from "./SalesOrders";
export * from "./ProductOptions";