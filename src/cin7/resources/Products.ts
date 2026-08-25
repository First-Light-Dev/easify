import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { Product, ProductProductOption } from "./types/Products";

function whereValue(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export default class Products {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async get(id: string): Promise<Product | undefined> {
        const response = await this.axios.get(`/Products/${id}`);
        return response.data;
    }

    async getByIds(ids: string[]): Promise<Product[]> {
        const response = await this.axios.get(`/Products?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data as Product[];
    }

    /**
     * The product carrying a style code, or undefined.
     *
     * Note this is the **parent** product code, not a SKU. Sellable SKUs are the `code` on
     * each entry of `productOptions` — use `getBySku` for those.
     */
    async getByStyleCode(styleCode: string): Promise<Product | undefined> {
        const response = await this.axios.get(`/Products`, {
            params: { where: `styleCode=${whereValue(styleCode)}` }
        });
        const products = response.data as Product[];
        return products.find(product => product.styleCode === styleCode);
    }

    async getByCategoryId(categoryId: number, page: number = 1, rows: number = 100): Promise<Product[]> {
        const response = await this.axios.get(`/Products`, {
            params: { where: `categoryIdArray=${categoryId}`, page, rows }
        });
        return response.data as Product[];
    }

    /**
     * The product that owns a SKU, plus the matching option.
     *
     * Cin7 nests SKUs one level down — `Product.productOptions[].code` — so a SKU cannot be
     * looked up on `/Products` directly. This resolves through `/ProductOptions` to get the
     * owning `productId`, then fetches the product.
     *
     * Returns undefined rather than throwing when the SKU is unknown; an ambiguous SKU throws,
     * because two products sharing one SKU is a data problem an operator must resolve and
     * picking one would sync prices onto an arbitrary product.
     */
    async getBySku(sku: string): Promise<{ product: Product, option: ProductProductOption } | undefined> {
        const wanted = sku.trim();
        if (!wanted) return undefined;

        const response = await this.axios.get(`/ProductOptions`, {
            params: { where: `code=${whereValue(wanted)}` }
        });

        const options = (response.data as ProductProductOption[]).filter(option => option.code?.trim() === wanted);
        if (options.length === 0) return undefined;

        const productIds = Array.from(new Set(options.map(option => option.productId)));
        if (productIds.length > 1) {
            throw new Error(`SKU '${wanted}' maps to ${productIds.length} Cin7 products (${productIds.join(', ')}). The duplicates must be resolved in Cin7 before this SKU can sync.`);
        }

        const product = await this.get(productIds[0].toString());
        if (!product) return undefined;

        const option = product.productOptions?.find(o => o.code?.trim() === wanted) ?? options[0];
        return { product, option };
    }

    async create(product: Partial<Product>): Promise<string> {
        console.log("Creating Product", JSON.stringify(product));
        const response = await this.axios.post(`/Products`, [product]);

        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async createBatch(products: Partial<Product>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.post(`/Products`, products);
        console.log("Products Create Batch Response", JSON.stringify(response.data));
        return response.data as Array<APIUpsertResponse>;
    }

    async update(product: Partial<Product>): Promise<string> {
        console.log("Updating Product", JSON.stringify(product));
        const response = await this.axios.put(`/Products`, [product]);
        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async updateBatch(products: Partial<Product>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.put(`/Products`, products);
        return response.data as Array<APIUpsertResponse>;
    }

    async query(where: string, page: number = 1, rows: number = 100, order?: {field: string, direction : "ASC" | "DESC"}): Promise<Product[]> {
        const response = await this.axios.get(`/Products`, {
            params: {
                where,
                page,
                rows,
                ...(order ? { order: `${order.field} ${order.direction}` } : {})
            }
        });
        return response.data as Product[];
    }

    async getRecentlyModified(timeWindow: number = 18 * 60 * 1000): Promise<Product[]> {
        const now = new Date();

        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString();

        const products = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/Products`, {
                params: {
                    where: `modifiedDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            products.push(...response.data);
            if(response.data.length === 0) break;
            page++;
        }
        return products;
    }

    async getRecentlyCreated(timeWindow: number = 18 * 60 * 1000): Promise<Product[]> {
        const now = new Date();

        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString();

        const products = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/Products`, {
                params: {
                    where: `createdDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            products.push(...response.data);
            if(response.data.length === 0) break;
            page++;
        }
        return products;
    }

    /**
     * Every product modified at or after an explicit timestamp, oldest first.
     *
     * The read the scheduled catalogue sync is built on. `getRecentlyModified` takes a rolling
     * window, which does not fit a poller resuming from a stored cursor. The bound is
     * inclusive, so the checkpoint record returns again on the next run — writes driven by it
     * must be idempotent.
     */
    async getModifiedSince(since: Date | string, rows: number = 250): Promise<Product[]> {
        const timestamp = typeof since === "string" ? since : since.toISOString();

        const products: Product[] = [];

        let page = 1;
        while(true) {
            const response = await this.axios.get(`/Products`, {
                params: {
                    where: `modifiedDate >= '${timestamp}'`,
                    order: "modifiedDate ASC",
                    page,
                    rows
                }
            });
            const batch = response.data as Product[];
            products.push(...batch);
            if(batch.length < rows) break;
            page++;
        }
        return products;
    }
}
