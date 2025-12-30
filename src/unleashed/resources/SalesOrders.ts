import { AxiosInstance } from "axios";
import Unleashed, { SalesOrder, SalesOrderGetQuery, SalesOrderGetQuerySchema, SalesOrderSchema, SalesOrderUpdate } from "..";
import { UnleashedQueryResponse } from "./types";
import crypto from "crypto";

export default class SalesOrders {
    constructor(private axios: AxiosInstance, private unleashed: Unleashed) {}

    async query(query: SalesOrderGetQuery = {}): Promise<UnleashedQueryResponse<SalesOrder>> {
        const validatedQuery = SalesOrderGetQuerySchema.parse(query);
        const response = await this.axios.get('/SalesOrders', {
            params: validatedQuery
        });
        
        const data = response.data as UnleashedQueryResponse<any>;
        return {
            ...data,
            Items: data.Items?.map((item: any) => SalesOrderSchema.parse(item)) || []
        };
    }

    async get(id: string): Promise<SalesOrder> {
        const response = await this.axios.get(`/SalesOrders/${id}`);
        return SalesOrderSchema.parse(response.data);
    }

    async update(payload: SalesOrderUpdate, previousHash?: string): Promise<{updated: boolean, salesOrder: SalesOrder | null, hash: string}> {
        if (previousHash && this.compareUpdateHash(payload, previousHash)) {
            return {updated: false, salesOrder: null, hash: previousHash};
        }
        const response = await this.axios.put(`/SalesOrders`, payload);
        return { updated: true, salesOrder: SalesOrderSchema.parse(response.data), hash: this.getUpdateHash(payload) };
    }

    async complete(id: string) {
        const response = await this.axios.post(`/SalesOrders/${id}/Complete`);
        return response.data;
    }

    getUpdateHash(payload: SalesOrderUpdate): string {
        const sortedPayload = Object.keys(payload).sort().reduce((acc, key) => {
            acc[key] = payload[key as keyof typeof payload];
            return acc;
        }, {} as Record<string, any>);
        return crypto.createHash('sha256').update(JSON.stringify(sortedPayload)).digest('hex');
    }

    compareUpdateHash(payload: SalesOrderUpdate, hash: string): boolean {
        return this.getUpdateHash(payload) === hash;
    }
}

