/**
 * ShipStation orders.
 *
 * Serves flow 4 only: a Cin7 stock transfer leaving the USA becomes a ShipStation sales
 * order for the 3PL to pick and ship.
 *
 * **Write-mostly by design.** The app never polls ShipStation — the client's existing
 * ShipStation->Finale sync surfaces the fulfilment in Finale, and flow 4b reads it there.
 * `get` and `findByOrderNumber` exist for reconciliation and support, not for the flow.
 *
 * VERIFY: `POST /orders/createorder` and `GET /orders` are ShipStation V1 paths from the
 * public docs. Nothing here was confirmed against the 3PL's account.
 */

import type { ShipStationHttpClient } from '../client/http-client';
import {
  ShipStationClientError,
  ShipStationOrderNotUpdatableError,
  looksLikeNotUpdatable,
  translateShipStationError,
} from '../errors/index';
import type { ShipStationOrder, ShipStationOrderInput } from '../types/orders';

/** ShipStation's documented cap on `orderNumber`. */
const MAX_ORDER_NUMBER_LENGTH = 50;

/** Statuses ShipStation still allows `createorder` to update. */
const UPDATABLE_STATUSES = new Set(['awaiting_payment', 'awaiting_shipment', 'on_hold']);

export interface ShipStationOrdersOptions {
  /** Stamped on created orders as `advancedOptions.storeId`. */
  storeId?: number;
}

export class ShipStationOrders {
  constructor(
    private readonly http: ShipStationHttpClient,
    private readonly options: ShipStationOrdersOptions = {}
  ) {}

  /**
   * Creates — or updates — an order.
   *
   * ShipStation's `createorder` is an **upsert keyed on `orderKey`**, which is what makes a
   * retry safe. Cloud Tasks can deliver the same task twice; with an `orderKey` derived from
   * the Cin7 transfer, the second delivery updates the existing order rather than creating a
   * duplicate the 3PL would pick and ship again. So `orderKey` is required here even though
   * ShipStation treats it as optional.
   *
   * **That protection has a boundary.** ShipStation only permits updates to orders in
   * `awaiting_payment`, `awaiting_shipment` or `on_hold`; a `shipped` or `cancelled` order
   * rejects the call. So the one sequence the upsert does *not* absorb is: we create the
   * order, the 3PL ships it, and a late retry then fires. Left alone that reads as a failed
   * sync for a transfer that completed perfectly.
   *
   * This method detects that case, confirms it by looking the order up, and throws
   * `ShipStationOrderNotUpdatableError` carrying the existing order — so the host can treat
   * it as work already done rather than a failure. The confirmation matters: the rejection is
   * only identifiable by message text, and a lookup turns a guess into a fact.
   */
  async createOrder(input: ShipStationOrderInput): Promise<ShipStationOrder> {
    this.assertOrderNumber(input);
    this.assertOrderKey(input);
    this.assertItems(input);
    this.assertShipTo(input);

    const body: ShipStationOrderInput = {
      ...input,
      // ShipStation requires billTo. A stock transfer has no biller, so the destination is
      // the least surprising thing to send — see the note on ShipStationOrderInput.billTo.
      billTo: input.billTo ?? input.shipTo,
      advancedOptions: {
        ...input.advancedOptions,
        ...(this.options.storeId !== undefined ? { storeId: this.options.storeId } : {}),
      },
    };

    try {
      return await this.http.post<ShipStationOrder>('/orders/createorder', body, {
        operation: 'createShipStationOrder',
        recordId: input.orderNumber,
      });
    } catch (error) {
      const failure = translateShipStationError(error, {
        operation: 'createShipStationOrder',
        recordId: input.orderNumber,
      });
      throw await this.explainIfAlreadyFulfilled(failure, input);
    }
  }

  /**
   * Turns a not-updatable rejection into a typed, explained error.
   *
   * Only acts on a 400 whose message looks like the non-open-status refusal, and only after
   * a lookup confirms the order exists and has genuinely left an open status. If the lookup
   * disagrees — or fails — the original error is returned untouched, because a message-text
   * heuristic must never be allowed to manufacture a false "already done".
   */
  private async explainIfAlreadyFulfilled(
    failure: Error & { statusCode?: number; responseData?: unknown },
    input: ShipStationOrderInput
  ): Promise<Error> {
    if (failure.statusCode !== 400 || !looksLikeNotUpdatable(failure.responseData)) {
      return failure;
    }

    let existing: ShipStationOrder | null = null;
    try {
      existing = await this.findByOrderNumber(input.orderNumber);
    } catch {
      // The lookup is a courtesy; if it fails the caller still gets the real error.
      return failure;
    }

    const status = existing?.orderStatus;
    if (!existing || !status || UPDATABLE_STATUSES.has(status)) return failure;

    return new ShipStationOrderNotUpdatableError({
      operation: 'createShipStationOrder',
      recordId: input.orderNumber,
      statusCode: 400,
      responseData: failure.responseData,
      existingOrder: existing,
      message:
        `ShipStation order ${input.orderNumber} already exists with status "${status}" and ` +
        `can no longer be updated. The order was created successfully earlier — this is a ` +
        `late retry, not a failure, and the host should treat it as work already done.`,
      cause: failure,
    });
  }

  /** One order by ShipStation's numeric id. */
  async get(orderId: number): Promise<ShipStationOrder> {
    return this.http.get<ShipStationOrder>(`/orders/${orderId}`, undefined, {
      operation: 'getShipStationOrder',
      recordId: String(orderId),
    });
  }

  /**
   * Finds an order by the Cin7 reference used as its order number.
   *
   * The reconciliation path: if a `record_links` document is missing, this recovers the
   * ShipStation id from the Cin7 transfer number. Returns null rather than throwing —
   * "no such order" is a normal answer when checking whether a create landed.
   *
   * VERIFY the response envelope. V1 documents `{ orders: [...], total, page, pages }`.
   */
  async findByOrderNumber(orderNumber: string): Promise<ShipStationOrder | null> {
    const wanted = orderNumber.trim();
    if (!wanted) return null;

    const response = await this.http.get<{ orders?: ShipStationOrder[] }>(
      '/orders',
      { orderNumber: wanted, pageSize: 50 },
      { operation: 'findShipStationOrder', recordId: wanted }
    );

    const orders = response.orders ?? [];
    // Filter for an exact match: ShipStation's orderNumber filter may be a partial match,
    // and returning a different transfer's order would corrupt the correlation.
    return orders.find((order) => order.orderNumber?.trim() === wanted) ?? null;
  }

  // ─── Guards ─────────────────────────────────────────────────────────────────

  /**
   * ShipStation caps `orderNumber` at 50 characters and would silently trim a longer value.
   * That is unacceptable here: this field is the correlation key that must survive into
   * Finale for flow 4b, so a trimmed value breaks the return path with nothing erroring.
   */
  private assertOrderNumber(input: ShipStationOrderInput): void {
    const value = input.orderNumber?.trim();
    if (!value) {
      throw new ShipStationClientError({
        operation: 'createShipStationOrder',
        message: 'createOrder requires orderNumber — it carries the Cin7 reference.',
        statusCode: 400,
      });
    }
    if (value.length > MAX_ORDER_NUMBER_LENGTH) {
      throw new ShipStationClientError({
        operation: 'createShipStationOrder',
        recordId: value,
        message:
          `orderNumber is ${value.length} characters; ShipStation allows ` +
          `${MAX_ORDER_NUMBER_LENGTH} and would truncate silently. That would break the ` +
          `correlation back to Cin7, so this fails instead.`,
        statusCode: 400,
      });
    }
  }

  private assertOrderKey(input: ShipStationOrderInput): void {
    if (input.orderKey && input.orderKey.trim()) return;
    throw new ShipStationClientError({
      operation: 'createShipStationOrder',
      recordId: input.orderNumber,
      message:
        'createOrder requires orderKey. ShipStation upserts on it, and it is the only ' +
        'thing that makes a redelivered Cloud Task update the order rather than create a ' +
        'duplicate the 3PL would ship twice. Derive it from the Cin7 transfer id.',
      statusCode: 400,
    });
  }

  private assertItems(input: ShipStationOrderInput): void {
    if (input.items && input.items.length > 0) return;
    throw new ShipStationClientError({
      operation: 'createShipStationOrder',
      recordId: input.orderNumber,
      message:
        'createOrder was called with no items. An empty order tells the 3PL nothing and is ' +
        'far more likely to be a mapping that produced nothing than a deliberate request.',
      statusCode: 400,
    });
  }

  /**
   * Requires a usable destination address.
   *
   * Deliberately **stricter than the API**: ShipStation documents every Address field as
   * optional, and would accept a half-filled one. But an address without a street or
   * postcode fails later at label time, at the 3PL, on a shipment that already looked
   * accepted. Failing here points straight at the host's per-location configuration, which
   * is where the omission actually is.
   */
  private assertShipTo(input: ShipStationOrderInput): void {
    const missing = (['name', 'street1', 'city', 'state', 'postalCode', 'country'] as const)
      .filter((field) => !input.shipTo?.[field]);

    if (missing.length === 0) return;
    throw new ShipStationClientError({
      operation: 'createShipStationOrder',
      recordId: input.orderNumber,
      message:
        `createOrder shipTo is missing required fields: ${missing.join(', ')}. ` +
        `A stock transfer still needs a destination address — these come from the host's ` +
        `per-location configuration, not from the Cin7 transfer.`,
      statusCode: 400,
    });
  }
}
