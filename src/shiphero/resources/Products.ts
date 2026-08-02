import type {
  AddProductToWarehouseInput,
  CreateProductInput,
  DeleteProductInput,
  UpdateProductInput
} from '../generated/inputs';
import type { Product, WarehouseProduct } from '../generated/objects';
import type { ProductQueryArgs, ProductsQueryArgs } from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import { PRODUCT, PRODUCT_WITH_INVENTORY, WAREHOUSE_PRODUCT } from './base/selections';

/**
 * The product catalogue. The default selection covers catalogue fields only; pass
 * `withInventory` when you also need per-warehouse stock, which is roughly twice
 * the credits.
 *
 * ```ts
 * const changed = await shiphero.products.listAll({ updated_from: since.toISOString() });
 * await shiphero.products.upsert({ sku: 'BLUE-TEE-M', name: 'Blue Tee', price: '19.99' });
 * ```
 */
export default class Products extends BaseResource {
  /** Fetches one product by id, SKU or barcode. */
  get(args: ProductQueryArgs, options: GetOptions = {}): Promise<Product | null> {
    return this.fetchObject<Product>('product', args, PRODUCT_WITH_INVENTORY, options);
  }

  /** Fetches one product by SKU. */
  getBySku(sku: string, options: GetOptions = {}): Promise<Product | null> {
    return this.get({ sku }, options);
  }

  /** A single page of products. */
  page(args: ProductsQueryArgs = {}, options: PageOptions = {}): Promise<Page<Product>> {
    return this.fetchPage<Product>('products', args, PRODUCT, options);
  }

  /** Iterates pages of products, following ShipHero's cursors. */
  pages(args: ProductsQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<Product>('products', args, PRODUCT, options);
  }

  /** Collects every matching product. */
  listAll(args: ProductsQueryArgs = {}, options: ListAllOptions = {}): Promise<Product[]> {
    return this.collect<Product>('products', args, PRODUCT, options);
  }

  /**
   * Every product created or updated at or after `since`. The natural shape of a
   * catalogue sync: run it on a schedule with the previous run's timestamp.
   */
  updatedSince(
    since: Date | string,
    args: ProductsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Product[]> {
    return this.listAll({ ...args, updated_from: toISO(since) }, options);
  }

  /** Products including their per-warehouse stock records. */
  listAllWithInventory(
    args: ProductsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Product[]> {
    return this.collect<Product>('products', args, PRODUCT_WITH_INVENTORY, options);
  }

  /** Estimated credit cost of a `products` query, without running it. */
  estimateCost(args: ProductsQueryArgs = {}, options: PageOptions = {}): Promise<number> {
    return this.estimate('products', args, options.selection ?? PRODUCT, options);
  }

  create(data: CreateProductInput, options: MutateOptions = {}): Promise<Product> {
    return this.runMutation<Product>('product_create', { data }, PRODUCT_WITH_INVENTORY, options);
  }

  update(data: UpdateProductInput, options: MutateOptions = {}): Promise<Product> {
    return this.runMutation<Product>('product_update', { data }, PRODUCT_WITH_INVENTORY, options);
  }

  /**
   * Creates the product when the SKU is new and updates it otherwise, which is what
   * a one-way catalogue sync from an ERP needs.
   *
   * ShipHero has no upsert mutation and rejects `product_create` for an existing SKU,
   * so this looks the SKU up first. Note that `product_update` accepts a narrower set
   * of fields than `product_create`: price, value and warehouse stock are per-warehouse
   * and are set through {@link addToWarehouse} or the inventory resource.
   */
  async upsert(
    data: CreateProductInput,
    options: MutateOptions = {}
  ): Promise<{ product: Product; created: boolean }> {
    const existing = await this.getBySku(data.sku, { selection: 'id sku' });
    if (!existing) return { product: await this.create(data, options), created: true };

    const { sku, customer_account_id, name, dimensions, tariff_code, product_note } = data;
    const update: UpdateProductInput = {
      sku,
      customer_account_id,
      name,
      dimensions,
      tariff_code,
      product_note,
      country_of_manufacture: data.country_of_manufacture,
      needs_serial_number: data.needs_serial_number,
      dropship: data.dropship,
      barcode: data.barcode,
      customs_description: data.customs_description,
      ignore_on_customs: data.ignore_on_customs,
      ignore_on_invoice: data.ignore_on_invoice,
      tags: data.tags,
      final_sale: data.final_sale,
      virtual: data.virtual,
      needs_lot_tracking: data.needs_lot_tracking,
      packer_note: data.packer_note,
      is_assembly: data.is_assembly,
      size: data.size,
      style: data.style,
      vendor_part_number: data.vendor_part_number,
      consumer_package_code: data.consumer_package_code,
      buyer_part_number: data.buyer_part_number,
      buyer_style_number: data.buyer_style_number,
      auto_pack: data.auto_pack
    };

    return { product: await this.update(update, options), created: false };
  }

  /** Adds an existing product to another warehouse, creating its stock record there. */
  addToWarehouse(
    data: AddProductToWarehouseInput,
    options: MutateOptions = {}
  ): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'product_add_to_warehouse',
      { data },
      WAREHOUSE_PRODUCT,
      options
    );
  }

  delete(data: DeleteProductInput): Promise<unknown> {
    return this.runMutation('product_delete', { data }, '');
  }
}
