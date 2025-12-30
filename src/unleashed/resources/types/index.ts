export interface UnleashedQueryResponse<T> {
    Pagination: {
        NumberOfItems: number;
        PageSize: number;
        PageNumber: number;
        NumberOfPages: number;
    };
    Items: T[];
}

export * from "./SalesOrders";