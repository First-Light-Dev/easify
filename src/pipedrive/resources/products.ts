/**
 * Products — the catalogue, and the join point to an inventory system's SKUs.
 *
 * `code` is Pipedrive's SKU field. It is not unique-enforced, so a catalogue sync driven from
 * an external master has to detect duplicates rather than assume a lookup returns one row —
 * two products sharing a SKU means the next price update lands on an arbitrary one of them.
 */

import { PipedriveResource } from './base';
import { PipedriveClientError } from '../errors/index';
import type { PipedriveHttpClient } from '../client/http-client';
import { MAX_PAGE_LIMIT } from '../types/common';
import type {
  PipedriveProduct,
  PipedriveProductInput,
  PipedriveProductListOptions,
  PipedriveProductPrice,
} from '../types/products';

interface SearchItem<T> {
  item: T;
}

export class PipedriveProducts extends PipedriveResource<
  PipedriveProduct,
  PipedriveProductInput,
  PipedriveProductListOptions
> {
  constructor(http: PipedriveHttpClient) {
    super(http, 'products', 'Product');
  }

  /**
   * The product carrying a SKU exactly, or null.
   *
   * Throws on an ambiguous match rather than choosing. Two products with the same `code` is a
   * data problem an operator must resolve; picking one would push price updates into
   * whichever the search happened to rank first, and the other would drift silently.
   */
  async findByCode(code: string): Promise<PipedriveProduct | null> {
    const matches = await this.findAllByCode(code);

    if (matches.length > 1) {
      throw new PipedriveClientError({
        message:
          `SKU "${code}" matches ${matches.length} products in Pipedrive ` +
          `(ids ${matches.map((product) => product.id).join(', ')}). The duplicates must be ` +
          `resolved there before the catalogue can sync against this SKU.`,
        operation: 'findProductByCode',
        recordId: code,
      });
    }

    return matches[0] ?? null;
  }

  /** Every product whose `code` matches exactly — for duplicate detection. */
  async findAllByCode(code: string): Promise<PipedriveProduct[]> {
    const wanted = code.trim().toLowerCase();
    if (!wanted) return [];

    const result = await this.http.get<{ items?: Array<SearchItem<PipedriveProduct>> }>(
      'products/search',
      { term: wanted, fields: 'code', exact_match: true, limit: 100 },
      this.context('findProductByCode', wanted)
    );

    return (result.items ?? [])
      .map((entry) => entry.item)
      .filter((product) => product.code?.trim().toLowerCase() === wanted);
  }

  /**
   * Creates the product if its SKU is absent, updates it if present.
   *
   * The shape a catalogue sync from an external master needs. Not atomic: two concurrent runs
   * for the same new SKU can both find nothing and both create, so a catalogue sync should be
   * serialised per SKU rather than fanned out.
   */
  async upsertByCode(
    code: string,
    input: PipedriveProductInput
  ): Promise<{ product: PipedriveProduct; created: boolean }> {
    const existing = await this.findByCode(code);
    if (existing) {
      return { product: await this.update(existing.id, input), created: false };
    }
    return { product: await this.create({ ...input, code }), created: true };
  }

  /**
   * Replaces the price list.
   *
   * Pipedrive holds one price per currency, and a PATCH replaces the whole `prices` array
   * rather than merging into it — so a partial list silently drops the currencies it omits.
   * Send every currency the product should have.
   */
  async setPrices(
    id: number | string,
    prices: PipedriveProductPrice[]
  ): Promise<PipedriveProduct> {
    return this.update(id, { prices });
  }

  /** The variations defined on a product, if it has any. */
  async listVariations(id: number | string): Promise<Array<Record<string, unknown>>> {
    return this.http.listAll<Record<string, unknown>>(
      `products/${id}/variations`,
      { limit: MAX_PAGE_LIMIT },
      this.context('listProductVariations', id)
    );
  }
}
