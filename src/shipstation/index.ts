/**
 * ShipStation API — the vendor layer.
 *
 * This package owns everything specific to ShipStation's wire format — the client, the order
 * shapes and the error classification. Anything about what an order *means* to a particular
 * integration belongs in the application on top.
 *
 * ⚠ PROVENANCE. No ShipStation documentation was supplied for this project. Everything here is
 * written against ShipStation's **publicly documented V1 API** (`ssapi.shipstation.com`, HTTP
 * Basic with an API key and secret, `POST /orders/createorder`) and every endpoint carries a
 * `VERIFY` marker at its use site. Confirm the account's API version before the first live call.
 *
 * Two things here are easy to get wrong and are handled once, centrally:
 *
 * - **ShipStation runs two incompatible APIs.** V1 is `ssapi.shipstation.com` with Basic auth;
 *   V2 is `api.shipstation.com` with an `API-Key` header. So `baseUrl` and `authMode` are
 *   configuration rather than constants — V1 -> V2 is config plus new payload types, not a
 *   rewrite of the client, error handling or retry logic.
 * - **`createorder` is an upsert keyed on `orderKey`**, not a create. That is what makes a
 *   redelivered task update the existing order rather than have the 3PL ship the same stock
 *   twice — so `ShipStationOrders.createOrder` requires an `orderKey` even though ShipStation
 *   treats it as optional.
 *
 * Authentication is a static API key. There is no session to establish or refresh, which is why
 * a 401 is never retryable.
 */

import { ShipStationHttpClient } from './client/http-client';
import { ShipStationOrders } from './resources/orders';
import type { ShipStationConnectorConfig, ShipStationQuota } from './types/config';

/**
 * The root of the ShipStation API.
 *
 * One HTTP client shared by every resource, so retry, throttling and quota tracking are counted
 * once rather than per resource.
 *
 * Small on purpose. ShipStation is a **write-only** target in this integration: orders go in and
 * nothing is read back, because the client's own ShipStation->Finale sync surfaces the
 * fulfilment in Finale. So there is no poller, no webhook receiver, and no shipment or label
 * API here — adding one would invite a second source of truth for a fulfilment the app already
 * learns about from Finale.
 */
export class ShipStation {
  readonly orders: ShipStationOrders;

  private readonly http: ShipStationHttpClient;

  constructor(config: ShipStationConnectorConfig) {
    this.http = new ShipStationHttpClient(config);
    this.orders = new ShipStationOrders(this.http, { storeId: config.storeId });
  }

  /**
   * Remaining rate-limit quota as of the last call, or null before any call.
   *
   * Worth logging on a schedule: ShipStation V1 allows 40 requests/minute, and seeing the
   * headroom shrink is more useful than discovering the ceiling through a 429.
   */
  rateLimitQuota(): ShipStationQuota | null {
    return this.http.getQuota();
  }

  /**
   * Whether these credentials can reach ShipStation.
   *
   * Uses a cheap list call rather than a dedicated health endpoint — ShipStation has none, and
   * a 401 on any call answers the question. Flattens every failure to `false`, so when the
   * distinction matters call `orders.findByOrderNumber` and read the error type:
   * `ShipStationAuthError` is definitive, `ShipStationServerError` is transient.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.orders.findByOrderNumber('__connection-test__');
      return true;
    } catch {
      return false;
    }
  }
}

export default ShipStation;

// ─── Client ───────────────────────────────────────────────────────────────────
export { ShipStationHttpClient } from './client/http-client';
export type { ShipStationRequestOptions } from './client/http-client';

// ─── Resources ────────────────────────────────────────────────────────────────
export { ShipStationOrders } from './resources/orders';
export type { ShipStationOrdersOptions } from './resources/orders';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  ShipStationConnectorConfig,
  ShipStationCredentials,
  ShipStationAuthMode,
  ShipStationQuota,
  Gate,
  Logger,
} from './types/config';
export type {
  ShipStationAddress,
  ShipStationOrder,
  ShipStationOrderInput,
  ShipStationOrderItemInput,
  ShipStationOrderStatus,
} from './types/orders';

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  ShipStationApiError,
  ShipStationAuthError,
  ShipStationClientError,
  ShipStationNetworkError,
  ShipStationOrderNotUpdatableError,
  ShipStationRateLimitError,
  ShipStationServerError,
  translateShipStationError,
  describeShipStationBody,
  looksLikeNotUpdatable,
  readQuota,
} from './errors/index';
export type {
  ShipStationApiErrorInput,
  ShipStationErrorContext,
} from './errors/index';
