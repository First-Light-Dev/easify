export interface Stock {
    productId: number;
    productOptionId: number;
    modifiedDate: string;
    styleCode: string;
    code: string;
    barcode: string;
    branchId: number;
    size: string;
    available: number;
    stockOnHand: number;
    openSales: number;
    incoming: number;
    virtual: number;
    holding: number;
}