"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Payments {
    constructor(axios, cin7) {
        this.cin7 = cin7;
        this.axios = axios;
    }
    async get(id) {
        const response = await this.axios.get(`/Payments/${id}`);
        return response.data;
    }
    async getByOrderId(orderId) {
        try {
            const response = await this.axios.get(`/Payments?where=orderId=${orderId}`);
            return response.data;
        }
        catch (error) {
            return [];
        }
    }
    async create(payments) {
        try {
            const response = await this.axios.post(`/Payments`, payments);
            const data = response.data;
            const success = data.every(r => r.success);
            if (!success) {
                throw new Error(data[0].errors.join(', '));
            }
        }
        catch (error) {
            console.error(`Error creating payments:`, error);
            throw error;
        }
    }
    async createBatch(payments) {
        const response = await this.axios.post(`/Payments`, payments);
        return response.data;
    }
}
exports.default = Payments;
