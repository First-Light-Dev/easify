export interface Payment {
    id: string;
    transactionRef: string;
    amount: number;
    method: string;
    comments: string;
    orderId: string;
    paymentDate: string;
}
