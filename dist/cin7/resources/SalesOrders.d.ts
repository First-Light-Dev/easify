import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { SalesOrder } from "./types/SalesOrders";
export default class SalesOrders {
    private axios;
    private cin7;
    constructor(axios: AxiosInstance, cin7: Cin7);
    get(id: string): Promise<SalesOrder | undefined>;
    getByRef(ref: string): Promise<SalesOrder | undefined>;
    getByRefs(refs: string[]): Promise<SalesOrder[]>;
    getByIds(ids: string[]): Promise<SalesOrder[]>;
    create(salesOrder: Partial<SalesOrder>): Promise<string>;
    createBatch(salesOrders: Partial<SalesOrder>[]): Promise<Array<APIUpsertResponse>>;
    update(salesOrder: Partial<SalesOrder>): Promise<string>;
    updateBatch(salesOrders: Partial<SalesOrder>[]): Promise<Array<APIUpsertResponse>>;
    getRecentSalesOrders(timeWindow?: number): Promise<SalesOrder[]>;
    getInternalCommentsData<T extends Record<string, string>>(salesOrder: SalesOrder, separator?: string): T;
    getInternalCommentStr<T extends Record<string, string>>(data: T, separator?: string): string;
}
