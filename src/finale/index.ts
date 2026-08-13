/**
 * Finale Inventory API — the vendor layer.
 *
 * This package owns everything specific to Finale's wire format — the client, the record
 * shapes and the error classification. Anything about what a record *means* to a particular
 * integration belongs in the application on top.
 *
 * Three things here are easy to get wrong and are handled once, centrally:
 *
 * - **Collections are column-major.** `{ orderId: [...], orderUrl: [...] }`, not an array of
 *   objects. Code expecting rows finds zero records rather than erroring, so every collection
 *   read goes through `getCollection`, which transposes.
 * - **Every path is namespaced by account** — `/{accountPath}/api/{resource}` — so the account
 *   segment is part of the client, not each caller.
 * - **`filter` is base64-encoded JSON**, built by `encodeFilter`.
 *
 * Authentication is HTTP Basic with a static API key and secret. There is no session to
 * refresh, despite what older documentation describes.
 */

import { FinaleHttpClient } from './client/http-client';
import { FinaleFacilities } from './resources/facilities';
import { FinaleOrders } from './resources/orders';
import { FinaleProducts } from './resources/products';
import { FinaleVariances } from './resources/variances';
import type { FinaleConnectorConfig, FinaleQuota } from './types/config';

/** The API root. Overridable via `baseUrl` so a stand-in can be substituted in tests. */
export const FINALE_BASE_URL = 'https://app.finaleinventory.com';

/**
 * The root of the Finale Inventory API.
 *
 * One HTTP client shared by every resource, so retry, throttling and quota tracking are counted
 * once rather than per resource.
 */
export class Finale {
  readonly orders: FinaleOrders;
  readonly variances: FinaleVariances;
  readonly facilities: FinaleFacilities;
  readonly products: FinaleProducts;

  private readonly http: FinaleHttpClient;

  constructor(config: FinaleConnectorConfig) {
    this.http = new FinaleHttpClient(config);
    this.orders = new FinaleOrders(this.http);
    this.variances = new FinaleVariances(this.http);
    this.facilities = new FinaleFacilities(this.http);
    this.products = new FinaleProducts(this.http);
  }

  /** The account segment every path is namespaced by. */
  get accountPath(): string {
    return this.http.accountPath;
  }

  /** Remaining quota as of the last response, or null before any call. */
  rateLimitQuota(): FinaleQuota | null {
    return this.http.getQuota();
  }

  /**
   * Whether these credentials can reach Finale.
   *
   * Flattens every failure to `false`, losing the distinction between "wrong key" and "Finale
   * is down" — call a resource directly when that difference matters.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.facilities.list(1);
      return true;
    } catch {
      return false;
    }
  }
}

export default Finale;

// ─── Client ───────────────────────────────────────────────────────────────────
export { FinaleHttpClient } from './client/http-client';

// ─── Resources ────────────────────────────────────────────────────────────────
export { FinaleOrders, DEFAULT_COMPLETED_STATUSES } from './resources/orders';
export { FinaleVariances } from './resources/variances';
export { FinaleFacilities } from './resources/facilities';
export { FinaleProducts } from './resources/products';
export type { FinaleFacility } from './resources/facilities';
export type { FinaleProduct } from './resources/products';

// ─── Types ────────────────────────────────────────────────────────────────────
export type { FinaleUrl, FinalePage, FinaleListOptions } from './types/common';
export { asFinaleUrl, encodeFilter, clampRange, transposeCollection, finaleIdFromUrl } from './types/common';
export type {
  FinaleConnectorConfig,
  FinaleCredentials,
  FinaleQuota,
} from './types/config';
export type {
  FinaleOrder,
  FinaleOrderInput,
  FinaleOrderItem,
  FinaleOrderItemInput,
  FinaleOrderStatus,
  FinaleOrderType,
} from './types/orders';
export type {
  FinaleVariance,
  FinaleVarianceLine,
  FinaleVarianceQuery,
} from './types/variances';

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  FinaleApiError,
  FinaleAuthError,
  FinaleCredentialsError,
  FinaleClientError,
  FinaleProductNotFoundError,
  FinaleRateLimitError,
  FinaleServerError,
  FinaleNetworkError,
  FinaleResponseError,
  translateFinaleError,
} from './errors/index';
export type { FinaleApiErrorInput, FinaleErrorContext } from './errors/index';
