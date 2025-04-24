import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { Payment } from "./types/Payments";
export default class Payments {
    private axios: AxiosInstance;

    constructor(axios: AxiosInstance, private cin7: Cin7) {
        this.axios = axios;
    }

    async get(id: string): Promise<Payment | undefined> {
        const response = await this.axios.get(`/Payments/${id}`);
        return response.data;
    }
  
    async getByOrderId(orderId: number): Promise<Payment[]> {
        try {
            const response = await this.axios.get(`/Payments?where=orderId=${orderId}`);
            return response.data;
        } catch (error) {
            return [];  
        }
    }

    async create(payments: Partial<Payment>[]) {
        try {
            const response = await this.axios.post(`/Payments`, payments);
            const data = response.data as Array<APIUpsertResponse>;
            const success = data.every(r => r.success);
            if (!success) {
                throw new Error(data[0].errors.join(', '));
            }
        } catch (error) {
            console.error(`Error creating payments:`, error);
            throw error;
        }
    }

    async createBatch(payments: Partial<Payment>[]) {
        const response = await this.axios.post(`/Payments`, payments);
        return response.data as Array<APIUpsertResponse>;
    }
}