/**
 * Deals, and the products attached to them.
 *
 * The read an order integration actually needs is "which deals became won since X", and
 * Pipedrive has no filter for it — `updated_since` filters on `update_time`, and there is no
 * `won_since`. `wonSince` therefore filters the server-side window down locally on
 * `won_time`. See its own note for why the distinction matters.
 */

import { PipedriveResource } from './base';
import type { PipedriveHttpClient } from '../client/http-client';
import { MAX_PAGE_LIMIT, toPipedriveTime, type PipedriveListOptions } from '../types/common';
import type {
  PipedriveDeal,
  PipedriveDealInput,
  PipedriveDealListOptions,
  PipedriveDealProduct,
  PipedriveDealProductInput,
} from '../types/deals';

export class PipedriveDeals extends PipedriveResource<
  PipedriveDeal,
  PipedriveDealInput,
  PipedriveDealListOptions
> {
  constructor(http: PipedriveHttpClient) {
    super(http, 'deals', 'Deal');
  }

  /**
   * Deals that were **marked won** at or after a moment.
   *
   * Not the same as "won deals updated since", which is what a naive
   * `list({ status: 'won', updated_since })` returns — that also matches a deal won last year
   * whose title someone edited this morning, and an order integration would create a second
   * sales order for it.
   *
   * Pipedrive cannot filter on `won_time`, so this pulls the `update_time` window (a superset,
   * since winning a deal updates it) and narrows on `won_time` here.
   *
   * The superset is only reliable while the window reaches back far enough: a deal won at the
   * very edge of it is included, but one won before it and never touched since is not — which
   * is correct, because it was already handled on an earlier run.
   */
  async wonSince(since: Date | string, options: Partial<PipedriveDealListOptions> = {}) {
    const boundary = typeof since === 'string' ? new Date(since.replace(' ', 'T') + 'Z') : since;

    const candidates = await this.updatedSince(since, { ...options, status: 'won' });

    return candidates.filter((deal) => {
      if (!deal.won_time) return false;
      return new Date(deal.won_time.replace(' ', 'T') + 'Z').getTime() >= boundary.getTime();
    });
  }

  /** Marks a deal won. `won_time` is set by Pipedrive unless one is supplied. */
  async markWon(id: number | string, wonTime?: Date | string): Promise<PipedriveDeal> {
    return this.update(id, {
      status: 'won',
      ...(wonTime ? { won_time: toPipedriveTime(wonTime) } : {}),
    });
  }

  /** Marks a deal lost, with an optional reason. */
  async markLost(id: number | string, reason?: string): Promise<PipedriveDeal> {
    return this.update(id, { status: 'lost', ...(reason ? { lost_reason: reason } : {}) });
  }

  /** Every deal attached to a person. */
  async byPerson(personId: number, options: Partial<PipedriveDealListOptions> = {}) {
    return this.listAll({ ...options, person_id: personId } as PipedriveDealListOptions);
  }

  /** Every deal attached to an organization. */
  async byOrganization(orgId: number, options: Partial<PipedriveDealListOptions> = {}) {
    return this.listAll({ ...options, org_id: orgId } as PipedriveDealListOptions);
  }

  // ─── Deal products ──────────────────────────────────────────────────────────

  /** The product lines on a deal. */
  async listProducts(
    dealId: number | string,
    options: PipedriveListOptions = {}
  ): Promise<PipedriveDealProduct[]> {
    return this.http.listAll<PipedriveDealProduct>(
      `deals/${dealId}/products`,
      { limit: MAX_PAGE_LIMIT, ...options },
      this.context('listDealProducts', dealId)
    );
  }

  /**
   * Attaches a product to a deal.
   *
   * `item_price` and `quantity` are both required — Pipedrive does not fall back to the
   * catalogue price, so omitting the price attaches the line at zero.
   */
  async addProduct(
    dealId: number | string,
    input: PipedriveDealProductInput
  ): Promise<PipedriveDealProduct> {
    return this.http.post<PipedriveDealProduct>(
      `deals/${dealId}/products`,
      input,
      this.context('addDealProduct', dealId)
    );
  }

  /**
   * Updates one product line.
   *
   * `attachmentId` is the id of the **line**, from `listProducts`, not the catalogue
   * `product_id`. Passing the product id updates a different line, or 404s.
   */
  async updateProduct(
    dealId: number | string,
    attachmentId: number | string,
    input: Partial<PipedriveDealProductInput>
  ): Promise<PipedriveDealProduct> {
    return this.http.patch<PipedriveDealProduct>(
      `deals/${dealId}/products/${attachmentId}`,
      input,
      this.context('updateDealProduct', attachmentId)
    );
  }

  /** Removes one product line, identified by its attachment id. */
  async removeProduct(
    dealId: number | string,
    attachmentId: number | string
  ): Promise<{ id: number }> {
    return this.http.delete<{ id: number }>(
      `deals/${dealId}/products/${attachmentId}`,
      this.context('removeDealProduct', attachmentId)
    );
  }
}
