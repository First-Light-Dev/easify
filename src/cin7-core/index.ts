import axios, { AxiosInstance } from 'axios';

import Account from './resources/Account';
import AdvancedPurchases from './resources/AdvancedPurchases';
import Crm from './resources/Crm';
import Customers from './resources/Customers';
import Production from './resources/Production';
import Products from './resources/Products';
import Purchases from './resources/Purchases';
import Reference from './resources/Reference';
import Sales from './resources/Sales';
import Stock from './resources/Stock';
import Suppliers from './resources/Suppliers';

/** The root of the Cin7 Core (DEAR Inventory) v2 API. */
export const CIN7_CORE_BASE_URL = 'https://inventory.dearsystems.com/ExternalApi/v2';

export interface Cin7CoreConfig {
  auth: {
    /** Account ID from Cin7 Core > Integration > API. */
    accountId: string;
    /** Application key paired with the account id. */
    applicationKey: string;
  };
  options?: {
    /** Overrides the API root, mainly for testing. */
    baseURL?: string;
    /** Parses every response with the generated schemas. Defaults to true. */
    validate?: boolean;
    /** Logs each request and response to the console. Defaults to false. */
    log?: boolean;
    /** How many times to retry a rate-limited request. Defaults to 5, capped at 10. */
    maxRetries?: number;
  };
}

interface Cin7CoreRequestConfig {
  __retryCount?: number;
  [key: string]: unknown;
}

/**
 * A client for the Cin7 Core REST API v2
 * (https://dearinventory.docs.apiary.io/).
 *
 * ```ts
 * const core = new Cin7Core({
 *   auth: { accountId: '...', applicationKey: '...' }
 * });
 * const sales = await core.sales.list({ Limit: 50 });
 * ```
 */
export class Cin7Core {
  public readonly config: Cin7CoreConfig;
  private readonly axios: AxiosInstance;

  public readonly account: Account;
  public readonly advancedPurchases: AdvancedPurchases;
  public readonly crm: Crm;
  public readonly customers: Customers;
  public readonly production: Production;
  public readonly products: Products;
  public readonly purchases: Purchases;
  public readonly reference: Reference;
  public readonly sales: Sales;
  public readonly stock: Stock;
  public readonly suppliers: Suppliers;

  constructor(config: Cin7CoreConfig) {
    this.config = config;

    this.axios = axios.create({
      baseURL: config.options?.baseURL ?? CIN7_CORE_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-auth-accountid': config.auth.accountId,
        'api-auth-applicationkey': config.auth.applicationKey
      }
    });

    this.axios.interceptors.request.use(async (request) => {
      if (config.options?.log) {
        console.log('Cin7 Core Request', {
          url: `${request.baseURL}${request.url}`,
          method: request.method?.toUpperCase(),
          params: request.params ?? null,
          payload: request.data ?? null
        });
      }
      return request;
    });

    this.axios.interceptors.response.use(
      async (response) => {
        if (config.options?.log) {
          console.log('Cin7 Core Response', {
            status: response.status,
            url: response.config.url
          });
        }
        return response;
      },
      async (error: any) => {
        const request = error.config as Cin7CoreRequestConfig | undefined;
        const status = error.response?.status;

        if (config.options?.log) {
          console.log('Cin7 Core Error', {
            url: request?.url,
            method: request?.method,
            status,
            error: error.response?.data ?? error.message
          });
        }

        // Cin7 Core allows 60 calls per minute per application key.
        if (status !== 429 || !request) return Promise.reject(error);

        const maxRetries = Math.min(config.options?.maxRetries ?? 5, 10);
        request.__retryCount = (request.__retryCount ?? 0) + 1;
        if (request.__retryCount > maxRetries) return Promise.reject(error);

        const delay = Math.min(1000 * 2 ** request.__retryCount, 8000);
        const jitter = (Math.random() - 0.5) * 1000;
        await new Promise<void>((resolve) => setTimeout(resolve, delay + jitter));

        return this.axios(request as any);
      }
    );

    const resourceOptions = { validate: config.options?.validate };

    this.account = new Account(this.axios, resourceOptions);
    this.advancedPurchases = new AdvancedPurchases(this.axios, resourceOptions);
    this.crm = new Crm(this.axios, resourceOptions);
    this.customers = new Customers(this.axios, resourceOptions);
    this.production = new Production(this.axios, resourceOptions);
    this.products = new Products(this.axios, resourceOptions);
    this.purchases = new Purchases(this.axios, resourceOptions);
    this.reference = new Reference(this.axios, resourceOptions);
    this.sales = new Sales(this.axios, resourceOptions);
    this.stock = new Stock(this.axios, resourceOptions);
    this.suppliers = new Suppliers(this.axios, resourceOptions);
  }
}

export default Cin7Core;

export {
  Account,
  AdvancedPurchases,
  Crm,
  Customers,
  Production,
  Products,
  Purchases,
  Reference,
  Sales,
  Stock,
  Suppliers
};

export * from './resources/base/Resource';
export * from './resources/types';

/**
 * Types declared on the resource modules rather than generated from the
 * blueprint. `export *` above only covers the generated types and the resource
 * base, so without these a consumer cannot name a transfer status or a webhook
 * without reaching past the package's `exports` map — which is not permitted.
 */
export type { StockAdjustmentUpsert, StockTransferStatus } from './resources/Stock';
export type { Webhook } from './resources/Account';
