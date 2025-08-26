import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { Payment } from "./types/Payments";
import { Stock } from "./types/Stock";

export default class StockLevels {
    private axios: AxiosInstance;

    constructor(axios: AxiosInstance, private cin7: Cin7) {
        this.axios = axios;
    }

    async query(where: string, page: number = 1, rows: number = 100, order?: {field: string, direction : "ASC" | "DESC"}): Promise<Stock[]> {
        const response = await this.axios.get(`/Stock`, {
            params: {
                where,
                page,
                rows,
                ...(order ? { order: `${order.field} ${order.direction}` } : {})
            }
        });
        return response.data as Stock[];
    }
}