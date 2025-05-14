import { AxiosInstance } from "axios";
import Cin7 from "..";
import { ProductOption } from "./types";

export default class ProductOptions {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async get(id: string): Promise<ProductOption | undefined> {
        const response = await this.axios.get(`/ProductOptions/${id}`);
        return response.data;
    }

    async getByBarcodes(barcodes: string[]): Promise<ProductOption[]> {
        const _barcodes = barcodes.map(barcode => barcode.replace(/#/g, "%23"));
        const response = await this.axios.get(`/ProductOptions?where=${_barcodes.map(barcode => `barcode='${barcode}'`).join(' OR ')}`);
        return response.data as ProductOption[];
    }

    async getByIds(ids: string[]): Promise<ProductOption[]> {
        const response = await this.axios.get(`/ProductOptions?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data as ProductOption[];
    }

    async search(query: string): Promise<ProductOption[]> {
        const response = await this.axios.get(`/ProductOptions?where=${query}`);
        return response.data as ProductOption[];
    }

}