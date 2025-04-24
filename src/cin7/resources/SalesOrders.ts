import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "../types";
import Cin7 from "..";
export default class SalesOrders {
    constructor(private axios: AxiosInstance, private cin7: Cin7) {}

    async get(id: string): Promise<SalesOrder | undefined> {
        const response = await this.axios.get(`/SalesOrders/${id}`);
        return response.data;
    }

    async getByRef(ref: string): Promise<SalesOrder | undefined> {
        const response = await this.axios.get(`/SalesOrders?where=Reference='${ref}'`);
        const salesOrders = response.data as SalesOrder[];

        return salesOrders.find(so => so.reference === ref);
    }

    async getByRefs(refs: string[]): Promise<SalesOrder[]> {
        console.log("Getting Sales Orders by refs", refs);
        const response = await this.axios.get(`/SalesOrders?where=${refs.map(ref => `Reference='${ref.replace("#", "%23")}'`).join(' OR ')}`);
        return response.data as SalesOrder[];
    }

    async getByIds(ids: string[]): Promise<SalesOrder[]> {
        const response = await this.axios.get(`/SalesOrders?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data as SalesOrder[];
    }

    async create(salesOrder: Partial<SalesOrder>): Promise<string> {
        console.log("Creating Sales Order", JSON.stringify(salesOrder));
        const response = await this.axios.post(`/SalesOrders`, [salesOrder]);

        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async createBatch(salesOrders: Partial<SalesOrder>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.post(`/SalesOrders`, salesOrders);
        return response.data as Array<APIUpsertResponse>;
    }

    async update(salesOrder: Partial<SalesOrder>): Promise<string> {
        console.log("Updating Sales Order", JSON.stringify(salesOrder));
        const response = await this.axios.put(`/SalesOrders`, [salesOrder]);
        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async updateBatch(salesOrders: Partial<SalesOrder>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.put(`/SalesOrders`, salesOrders);
        return response.data as Array<APIUpsertResponse>;
    }

    async getRecentSalesOrders(timeWindow: number = 18 * 60 * 1000): Promise<SalesOrder[]> {
        const now = new Date();
    
        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString(); 

        const salesOrders = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/SalesOrders`, {
                params: {
                    where: `modifiedDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            salesOrders.push(...response.data);
            if(response.data.length === 0) break;
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

    getInternalCommentsData<T extends Record<string, string>>(salesOrder: SalesOrder, separator: string = '#--#'): T {
        const splitComments = salesOrder.internalComments.split(separator);
        const result: T = {} as T;
        splitComments.forEach(comment => {
            if(comment.includes('#FL#')) {
                comment = comment.replace('#FL#', '');
            }
            if(comment.includes(': ')) {
                const [key, value] = comment.split(': ');
                result[key as keyof T] = value as T[keyof T];
            }
        });
        return result;
    }

    getInternalCommentStr<T extends Record<string, string>>(data: T, separator: string = '#--#'): string {
        return `#FL#${Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(separator)}#FL#`;
    }
}

export interface SalesOrder {
    id: number;
    reference: string;
    
    createdDate: string;
    modifiedDate: string;

    lineItems: Array<SalesOrderItem>;
    productTotal: number;


    // Important Fields
    costCenter: string;
    alternativeTaxRate: string;
    stage: string;
    memberId: number;
    memberEmail: string;
    paymentTerms: string;
    branchId: number;
    
    // Address
    deliveryFirstName: string;
    deliveryLastName: string;
    deliveryCompany: string;
    deliveryAddress1: string;
    deliveryAddress2: string;
    deliveryCity: string;
    deliveryState: string;
    deliveryPostalCode: string;
    deliveryCountry: string;
    email: string;
    phone: string;
    customerOrderNo: string;

    // Fulfillment Relatef
    trackingCode: string;
    dispatchedDate: string; 
    logisticsCarrier: string;
    estimatedDeliveryDate: string;

    // Money Related
    invoiceDate: string;
    discountTotal: number;
    discountDescription: string;
    freightTotal: number;
    freightDescription: string;
    total: number;
    taxStatus: "Incl" | "Excl" | "Exempt";
    taxRate: number;

    customFields: Record<string, string | number>;


    internalComments: string;
    deliveryInstructions: string;

    logisticsStatus: number;
}

export interface SalesOrderItem {
    code: string;
    name: string;
    qty: number;
    option1?: string;
    option2?: string;
    option3?: string;
    unitPrice: number;
    discount: number;
    qtyShipped?: number;
    actualQty?: number;
}

