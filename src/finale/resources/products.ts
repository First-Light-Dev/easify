/**
 * Finale products — turning a SKU into the product URL that order lines require.
 *
 * Finale's internal product identifier is not the same as the external resource id, so a
 * product URL cannot be built by string concatenation: it has to come from a fetched record.
 * `resolveUrl` therefore filters the collection rather than guessing a path.
 *
 * That makes this the most frequently called read in an integration — once per order line —
 * and the best candidate for caching in the host.
 */

import { FinaleClientError, FinaleProductNotFoundError } from '../errors/index';
import type { FinaleHttpClient } from '../client/http-client';
import { asFinaleUrl, encodeFilter, type FinaleUrl } from '../types/common';

/** A product as Finale returns it. */
export interface FinaleProduct {
  productUrl?: string;
  /** Finale's external product id — usually the SKU. */
  productId?: string;
  internalName?: string;
  statusId?: string;
  [key: string]: unknown;
}

export class FinaleProducts {
  constructor(private readonly http: FinaleHttpClient) {}

  /**
   * One product by its Finale id or `productUrl`, or null if Finale has no such record.
   *
   * The counterpart to `findBySku`, and far cheaper: a per-record GET costs against the
   * **120/minute** budget, while `findBySku` filters a collection and costs against the
   * **300/hour** one. Reach for this whenever the URL is already in hand.
   *
   * It is the only correct way to get a SKU from a `productUrl`. The trailing path segment is
   * NOT reliably the `productId` — measured against a live account on 2026-10-09, 2,468 of
   * 20,000 products carried a numeric URL unrelated to their SKU (`COTG-1DayCleanse-10001` at
   * `/product/100289`). Code that slices the URL instead of asking will be wrong for those, and
   * wrong silently.
   */
  async get(idOrUrl: string): Promise<FinaleProduct | null> {
    const raw = idOrUrl.trim();
    if (!raw) return null;

    // Accepts either form so callers holding a `productUrl` need not dissect it first.
    const id = raw.includes('/') ? raw.replace(/\/+$/, '').split('/').pop() ?? '' : raw;
    if (!id) return null;

    try {
      return await this.http.get<FinaleProduct>(
        `product/${encodeURIComponent(id)}`,
        undefined,
        { operation: 'getFinaleProduct', recordId: id }
      );
    } catch (error) {
      // A deleted or unknown product is an answer, not a failure — the caller decides what an
      // unresolvable line means. Anything else (auth, throttling, a 5xx) still propagates.
      if (error instanceof FinaleClientError && error.statusCode === 404) return null;
      throw error;
    }
  }

  /**
   * The product whose `productId` matches a SKU exactly, or null.
   *
   * Filters server-side, then re-checks for an exact match locally. Finale's filter values
   * are `[lower, upper]` ranges rather than equality, so a filter can legitimately return
   * neighbours — and taking the first row back would put stock against the wrong product.
   * The same hazard appears in other inventory APIs, where a SKU filter turns out to be
   * a substring match.
   *
   * Throws on an ambiguous match rather than choosing: two products that both look like the
   * SKU is a data problem an operator must resolve, and silently picking one moves stock
   * against the wrong item.
   */
  async findBySku(sku: string): Promise<FinaleProduct | null> {
    const wanted = sku.trim();
    if (!wanted) return null;

    const items = await this.http.getCollection<FinaleProduct>(
      'product',
      { filter: encodeFilter({ productId: wanted }), limit: 50 },
      { operation: 'findFinaleProductBySku', recordId: wanted }
    );

    const exact = items.filter((product) => product.productId?.trim() === wanted);

    if (exact.length > 1) {
      // Ambiguous, not missing: Finale holds several products with this exact productId, so
      // picking one would attach stock to an arbitrary record. A human has to deduplicate.
      throw new FinaleClientError({
        message:
          `SKU "${wanted}" matches ${exact.length} products in Finale. Order lines cannot be ` +
          `built until the duplicates are resolved there.`,
        operation: 'findFinaleProductBySku',
        recordId: wanted,
      });
    }

    return exact[0] ?? null;
  }

  /**
   * A SKU resolved to a branded product URL, for building order lines.
   *
   * Throws when the SKU is unknown, because a caller asking for a URL is building an order
   * line and has no use for null. The message names the SKU so the host can surface it on
   * the sync record — "SKU missing in Finale" is an operator action, not a code bug.
   */
  async resolveUrl(sku: string): Promise<FinaleUrl> {
    const product = await this.findBySku(sku);
    const url = product?.productUrl;
    if (!url) {
      // Typed, not a bare TypeError: the caller must tell "no such product" apart from
      // "Finale rejected us", because only the first is fixed by creating a product.
      throw new FinaleProductNotFoundError(sku);
    }
    return asFinaleUrl(url);
  }
}
