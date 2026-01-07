import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import crypto from "crypto";
import SalesOrders from "./resources/SalesOrders";

export interface UnleashedConfig {
    auth: {
        api: {
            id: string;
            key: string;
        },
        clientType: string;
    }
}

export class Unleashed {
    public config: UnleashedConfig;
    private axios: AxiosInstance;

    public salesOrders: SalesOrders;
    
    constructor(config: UnleashedConfig) {
        this.config = config;
        this.axios = axios.create({
            baseURL: "https://api.unleashedsoftware.com",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "api-auth-id": `${this.config.auth.api.id}`,
                "client-type" : `${this.config.auth.clientType}`,
            },
        });

        this.axios.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
            
            // sign the request using the query parameters and the api key
            // we need the exact query parameters as a string
            // Example for request to /api/v1/sales-orders?page=1&pageSize=100
            // the query string should be "page=1&pageSize=100"
            const url = axios.getUri(config);
            const queryString = url.split('?')[1] || '';
            const signature = crypto.createHmac('sha256', this.config.auth.api.key).update(queryString).digest('base64');
            config.headers['api-auth-signature'] = signature;

            return config;
        });

        // A basic retry mechanism for 429 errors
        this.axios.interceptors.response.use(
            async response => {
                return response;
            },
            async (error: any) => {
                const { config, response } = error;

                if (response?.status !== 429) {
                    return Promise.reject(error);
                }

                console.log("Retrying request");

                config.__retryCount = config.__retryCount || 0;

                if (config.__retryCount >= config.retry || config.__retryCount >= 3) {
                    return Promise.reject(error);
                }

                config.__retryCount += 1;

                const backoff = new Promise<void>((resolve) => {
                    const delay = Math.min(1000 * (2 ** config.__retryCount), 8000); // Capped at 30 seconds
                    const jitter = (Math.random() - 0.5) * 1000; // Add up to 1 second of jitter
                    setTimeout(() => {
                        resolve();
                    }, delay + jitter);
                });

                await backoff;
                return this.axios(config);
            }
        );

        // Initialize resources
        this.salesOrders = new SalesOrders(this.axios, this);
    }

}

export default Unleashed;
export * from "./resources/types";