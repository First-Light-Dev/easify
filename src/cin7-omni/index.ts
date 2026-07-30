import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import Adjustments from './resources/Adjustments';
import BomMasters from './resources/BomMasters';
import Branches from './resources/Branches';
import BranchTransfers from './resources/BranchTransfers';
import Cartons from './resources/Cartons';
import Contacts from './resources/Contacts';
import CreditNotes from './resources/CreditNotes';
import FeesAndPayouts from './resources/FeesAndPayouts';
import Payments from './resources/Payments';
import ProductCategories from './resources/ProductCategories';
import ProductImages from './resources/ProductImages';
import ProductionJobs from './resources/ProductionJobs';
import ProductOptions from './resources/ProductOptions';
import Products from './resources/Products';
import PurchaseOrders from './resources/PurchaseOrders';
import Quotes from './resources/Quotes';
import SalesOrders from './resources/SalesOrders';
import SalesOrdersWithCartons from './resources/SalesOrdersWithCartons';
import SerialNumbers from './resources/SerialNumbers';
import SizeRanges from './resources/SizeRanges';
import Stock from './resources/Stock';
import Users from './resources/Users';
import Vouchers from './resources/Vouchers';

/** The root of the Cin7 Omni API. Resource paths are versioned below this, e.g. `/v1/SalesOrders`. */
export const CIN7_OMNI_BASE_URL = 'https://api.cin7.com/api';

/**
 * Tracks how many calls each API key has spent, so requests can be spread across several keys.
 * Cin7 allows 5000 calls per key per day, so this is normally backed by shared storage that
 * resets daily.
 */
export interface APICallCounter {
  get(): Promise<{ [key: string]: number }>;
  increment(key: string): Promise<void>;
  reset(): Promise<void>;
}

export interface Cin7OmniConfig {
  auth: {
    /** The API connection username shown in Cin7 under Integrations > API. */
    username: string;
    /** The API key paired with the username. */
    apiKey: string;
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
    /**
     * Spreads requests over additional API keys, moving to the next one as each approaches
     * its daily quota.
     */
    multiAPIKeyHandling?: {
      enabled: boolean;
      additionalAPIKeys: string[];
      keyCounter: APICallCounter;
      /** The call count at which a key is considered spent. Defaults to 4900. */
      cutoffAPICallCount?: number;
    };
  };
}

interface Cin7OmniRequestConfig extends InternalAxiosRequestConfig {
  apiKeyIndex?: string;
  __retryCount?: number;
}

function basicAuth(username: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}`;
}

/**
 * A client for the Cin7 Omni REST API (https://api.cin7.com/api/Help).
 *
 * ```ts
 * const cin7 = new Cin7Omni({ auth: { username: 'user', apiKey: 'key' } });
 * const orders = await cin7.salesOrders.modifiedSince(new Date(Date.now() - 3600_000));
 * ```
 */
export class Cin7Omni {
  public readonly config: Cin7OmniConfig;
  private readonly axios: AxiosInstance;

  public readonly adjustments: Adjustments;
  public readonly bomMasters: BomMasters;
  public readonly branches: Branches;
  public readonly branchTransfers: BranchTransfers;
  public readonly cartons: Cartons;
  public readonly contacts: Contacts;
  public readonly creditNotes: CreditNotes;
  public readonly feesAndPayouts: FeesAndPayouts;
  public readonly payments: Payments;
  public readonly productCategories: ProductCategories;
  public readonly productImages: ProductImages;
  public readonly productionJobs: ProductionJobs;
  public readonly productOptions: ProductOptions;
  public readonly products: Products;
  public readonly purchaseOrders: PurchaseOrders;
  public readonly quotes: Quotes;
  public readonly salesOrders: SalesOrders;
  public readonly salesOrdersWithCartons: SalesOrdersWithCartons;
  public readonly serialNumbers: SerialNumbers;
  public readonly sizeRanges: SizeRanges;
  public readonly stock: Stock;
  public readonly users: Users;
  public readonly vouchers: Vouchers;

  constructor(config: Cin7OmniConfig) {
    this.config = config;

    this.axios = axios.create({
      baseURL: config.options?.baseURL ?? CIN7_OMNI_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: basicAuth(config.auth.username, config.auth.apiKey)
      }
    });

    this.axios.interceptors.request.use(async (request: Cin7OmniRequestConfig) => {
      if (config.options?.log) {
        console.log('Cin7 Omni Request', {
          url: `${request.baseURL}${request.url}`,
          method: request.method?.toUpperCase(),
          params: request.params ?? null,
          payload: request.data ?? null
        });
      }

      const multiKey = config.options?.multiAPIKeyHandling;
      if (!multiKey?.enabled) return request;

      const keys = [config.auth.apiKey, ...multiKey.additionalAPIKeys];
      const counts = await multiKey.keyCounter.get();
      const cutoff = multiKey.cutoffAPICallCount ?? 4900;
      const index = Object.keys(counts).findIndex((key) => counts[key] < cutoff);

      if (index === -1) throw new Error('All Cin7 Omni API keys have reached their daily limit');

      request.apiKeyIndex = `${index}`;
      request.headers['Authorization'] = basicAuth(config.auth.username, keys[index]);
      return request;
    });

    this.axios.interceptors.response.use(
      async (response) => {
        const multiKey = config.options?.multiAPIKeyHandling;
        if (multiKey?.enabled) {
          const { apiKeyIndex } = response.config as Cin7OmniRequestConfig;
          await multiKey.keyCounter.increment(`${apiKeyIndex}`);
        }

        if (config.options?.log) {
          console.log('Cin7 Omni Response', {
            status: response.status,
            url: response.config.url
          });
        }
        return response;
      },
      async (error: any) => {
        const request = error.config as Cin7OmniRequestConfig | undefined;
        const status = error.response?.status;

        if (config.options?.log) {
          console.log('Cin7 Omni Error', {
            url: request?.url,
            method: request?.method,
            status,
            error: error.response?.data ?? error.message
          });
        }

        // Cin7 allows 3 calls per second and 60 per minute, so back off and retry on 429.
        if (status !== 429 || !request) return Promise.reject(error);

        const maxRetries = Math.min(config.options?.maxRetries ?? 5, 10);
        request.__retryCount = (request.__retryCount ?? 0) + 1;
        if (request.__retryCount > maxRetries) return Promise.reject(error);

        const delay = Math.min(1000 * 2 ** request.__retryCount, 8000);
        const jitter = (Math.random() - 0.5) * 1000;
        await new Promise<void>((resolve) => setTimeout(resolve, delay + jitter));

        return this.axios(request);
      }
    );

    const resourceOptions = { validate: config.options?.validate };

    this.adjustments = new Adjustments(this.axios, resourceOptions);
    this.bomMasters = new BomMasters(this.axios, resourceOptions);
    this.branches = new Branches(this.axios, resourceOptions);
    this.branchTransfers = new BranchTransfers(this.axios, resourceOptions);
    this.cartons = new Cartons(this.axios, resourceOptions);
    this.contacts = new Contacts(this.axios, resourceOptions);
    this.creditNotes = new CreditNotes(this.axios, resourceOptions);
    this.feesAndPayouts = new FeesAndPayouts(this.axios, resourceOptions);
    this.payments = new Payments(this.axios, resourceOptions);
    this.productCategories = new ProductCategories(this.axios, resourceOptions);
    this.productImages = new ProductImages(this.axios, resourceOptions);
    this.productionJobs = new ProductionJobs(this.axios, resourceOptions);
    this.productOptions = new ProductOptions(this.axios, resourceOptions);
    this.products = new Products(this.axios, resourceOptions);
    this.purchaseOrders = new PurchaseOrders(this.axios, resourceOptions);
    this.quotes = new Quotes(this.axios, resourceOptions);
    this.salesOrders = new SalesOrders(this.axios, resourceOptions);
    this.salesOrdersWithCartons = new SalesOrdersWithCartons(this.axios, resourceOptions);
    this.serialNumbers = new SerialNumbers(this.axios, resourceOptions);
    this.sizeRanges = new SizeRanges(this.axios, resourceOptions);
    this.stock = new Stock(this.axios, resourceOptions);
    this.users = new Users(this.axios, resourceOptions);
    this.vouchers = new Vouchers(this.axios, resourceOptions);
  }
}

export default Cin7Omni;

export {
  Adjustments,
  BomMasters,
  Branches,
  BranchTransfers,
  Cartons,
  Contacts,
  CreditNotes,
  FeesAndPayouts,
  Payments,
  ProductCategories,
  ProductImages,
  ProductionJobs,
  ProductOptions,
  Products,
  PurchaseOrders,
  Quotes,
  SalesOrders,
  SalesOrdersWithCartons,
  SerialNumbers,
  SizeRanges,
  Stock,
  Users,
  Vouchers
};

export * from './resources/base/Resource';
export * from './resources/types';
export type { ImagePriority, ProductImageUpload } from './resources/ProductImages';
