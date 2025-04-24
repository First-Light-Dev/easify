import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { Payment } from "./types/Payments";
export default class Payments {
    private cin7;
    private axios;
    constructor(axios: AxiosInstance, cin7: Cin7);
    get(id: string): Promise<Payment | undefined>;
    getByOrderId(orderId: number): Promise<Payment[]>;
    create(payments: Partial<Payment>[]): Promise<void>;
    createBatch(payments: Partial<Payment>[]): Promise<APIUpsertResponse[]>;
}
