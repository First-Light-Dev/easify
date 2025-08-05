
export interface Payment {
    id: string;
    transactionRef: string;
    amount: number;
    method: string;
    comments: string;
    orderId: string;
    orderRef: string;
    paymentDate: string;
    createdDate: string;
    modifiedDate: string;
}