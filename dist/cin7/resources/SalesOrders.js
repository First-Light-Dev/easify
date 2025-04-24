"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class SalesOrders {
    constructor(axios, cin7) {
        this.axios = axios;
        this.cin7 = cin7;
    }
    async get(id) {
        const response = await this.axios.get(`/SalesOrders/${id}`);
        return response.data;
    }
    async getByRef(ref) {
        const response = await this.axios.get(`/SalesOrders?where=Reference='${ref}'`);
        const salesOrders = response.data;
        return salesOrders.find(so => so.reference === ref);
    }
    async getByRefs(refs) {
        console.log("Getting Sales Orders by refs", refs);
        const response = await this.axios.get(`/SalesOrders?where=${refs.map(ref => `Reference='${ref.replace("#", "%23")}'`).join(' OR ')}`);
        return response.data;
    }
    async getByIds(ids) {
        const response = await this.axios.get(`/SalesOrders?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data;
    }
    async create(salesOrder) {
        console.log("Creating Sales Order", JSON.stringify(salesOrder));
        const response = await this.axios.post(`/SalesOrders`, [salesOrder]);
        const data = response.data;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }
    async createBatch(salesOrders) {
        const response = await this.axios.post(`/SalesOrders`, salesOrders);
        return response.data;
    }
    async update(salesOrder) {
        console.log("Updating Sales Order", JSON.stringify(salesOrder));
        const response = await this.axios.put(`/SalesOrders`, [salesOrder]);
        const data = response.data;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }
    async updateBatch(salesOrders) {
        const response = await this.axios.put(`/SalesOrders`, salesOrders);
        return response.data;
    }
    async getRecentSalesOrders(timeWindow = 18 * 60 * 1000) {
        const now = new Date();
        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString();
        const salesOrders = [];
        let page = 1;
        while (true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/SalesOrders`, {
                params: {
                    where: `modifiedDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            salesOrders.push(...response.data);
            if (response.data.length === 0)
                break;
            page++;
        }
        return salesOrders;
    }
    // // Utility Functions
    // getDataFromSalesOrderComments(salesOrder: SalesOrder): { returnId: string, fulfilmentOrderId: string } {
    //     const splitComments = salesOrder.internalComments.split('#--#');
    //     if(splitComments.length !== 4) return { returnId: "", fulfilmentOrderId: "" };
    //     const returnId = splitComments[1];
    //     const fulfilmentOrderId = splitComments[3];
    //     return {
    //         returnId,
    //         fulfilmentOrderId
    //     };
    // }
    getInternalCommentsData(salesOrder, separator = '#--#') {
        const splitComments = salesOrder.internalComments.split(separator);
        const result = {};
        splitComments.forEach(comment => {
            if (comment.includes('#FL#')) {
                comment = comment.replace('#FL#', '');
            }
            if (comment.includes(': ')) {
                const [key, value] = comment.split(': ');
                result[key] = value;
            }
        });
        return result;
    }
    getInternalCommentStr(data, separator = '#--#') {
        return `#FL#${Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(separator)}#FL#`;
    }
}
exports.default = SalesOrders;
