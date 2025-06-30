import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { SalesOrder } from "./types/SalesOrders";
import { SALES_ORDERS } from "../puppeteer/constants";
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

    async query(where: string, page: number = 1, rows: number = 100, order?: {field: string, direction : "ASC" | "DESC"}): Promise<SalesOrder[]> {
        const response = await this.axios.get(`/SalesOrders`, {
            params: {
                where,
                page,
                rows,
                ...(order ? { order: `${order.field} ${order.direction}` } : {})
            }
        });
        return response.data as SalesOrder[];
    }

    async getRecentlyModified(timeWindow: number = 18 * 60 * 1000): Promise<SalesOrder[]> {
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

    async getRecentlyCreated(timeWindow: number = 18 * 60 * 1000): Promise<SalesOrder[]> {
        const now = new Date();
    
        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString(); 

        const salesOrders = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/SalesOrders`, {
                params: {
                    where: `createdDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            salesOrders.push(...response.data);
            if(response.data.length === 0) break;
            page++;
        }
        return salesOrders;
    }

    async void(ids: string[]): Promise<Array<{ success: boolean, error: string }>> {

        let returnValues: Array<{ success: boolean, error: string }> = [];
        let page = await this.cin7.getPuppeteerPage();
        for (const salesOrderId of ids) {
            try {
                this.cin7.ensureDialogHandler(page);
                console.log("Voiding credit note", salesOrderId, SALES_ORDERS.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.salesOrders ?? "", salesOrderId));
                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 });
                } catch (error) {
                    if (error instanceof Error && error.name === 'TimeoutError') {
                        console.warn('Navigation timeout - continuing with execution');
                        // Optionally add a small delay to ensure page is in a stable state
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        throw error; // Re-throw if it's not a timeout error
                    }
                }
                await page.goto(SALES_ORDERS.getUrl(this.cin7.config.options?.puppeteer?.appLinkIds?.salesOrders ?? "", salesOrderId), { waitUntil: 'domcontentloaded' });

                await page.waitForSelector(SALES_ORDERS.selectors.adminButton, { timeout: 5000 });


                const [response] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(SALES_ORDERS.selectors.adminButton)
                ]);

                if (!response) {
                    throw new Error("Failed to go to admin page");
                }

                await page.waitForSelector(SALES_ORDERS.selectors.voidButton, { timeout: 5000 });

                const [voidResponse] = await Promise.all([
                    page.waitForNavigation(),
                    page.click(SALES_ORDERS.selectors.voidButton)
                ]);

                if (!voidResponse) {
                    throw new Error("Failed to void sales order");
                }

                returnValues.push({
                    success: true,
                    error: "",
                });
            } catch (error) {
                console.error(`Error voiding sales order ${salesOrderId}:`, error);
                returnValues.push({
                    success: false,
                    error: error instanceof Error ? error.message : `Error: ${error}`,
                });
                await page.close();
                page = await this.cin7.getPuppeteerPage();
            }
        }
        await this.cin7.closeBrowser();
        return returnValues;
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

    getInternalCommentsData<T extends Record<string, string>>(salesOrder: Partial<SalesOrder>, separator: string = '#--#'): T {
        const result: T = {} as T;

        if(!salesOrder.internalComments) return result;
        
        // Extract content between #FL# tags
        const matches = salesOrder.internalComments.match(/#FL#(.*?)#FL#/);
        if (!matches || !matches[1]) return result;
        
        // Split the extracted content by separator
        const splitComments = matches[1].split(separator);
        
        splitComments.forEach(comment => {
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

