import type {
  AddProductToVendorInput,
  CreateVendorInput,
  DeleteVendorInput,
  RemoveProductFromVendorInput
} from '../generated/inputs';
import type { Vendor } from '../generated/objects';

import { BaseResource, ListAllOptions, MutateOptions, Page, PageOptions } from './base/Resource';
import { VENDOR } from './base/selections';

/**
 * Vendors, needed when raising a purchase order against a supplier.
 *
 * ```ts
 * const vendor = await shiphero.vendors.findByName('Acme Supplies');
 * ```
 */
export default class Vendors extends BaseResource {
  page(options: PageOptions = {}): Promise<Page<Vendor>> {
    return this.fetchPage<Vendor>('vendors', {}, VENDOR, options);
  }

  listAll(options: ListAllOptions = {}): Promise<Vendor[]> {
    return this.collect<Vendor>('vendors', {}, VENDOR, options);
  }

  /** Case-insensitive exact match on vendor name. */
  async findByName(name: string): Promise<Vendor | undefined> {
    const vendors = await this.listAll();
    const target = name.trim().toLowerCase();
    return vendors.find((vendor) => vendor.name?.trim().toLowerCase() === target);
  }

  create(data: CreateVendorInput, options: MutateOptions = {}): Promise<Vendor> {
    return this.runMutation<Vendor>(
      'vendor_create',
      { data },
      options.selection ?? VENDOR,
      options
    );
  }

  delete(data: DeleteVendorInput): Promise<unknown> {
    return this.runMutation('vendor_delete', { data }, '');
  }

  /** Associates a product with a vendor, including the vendor's SKU and price. */
  addProduct(data: AddProductToVendorInput): Promise<unknown> {
    return this.runMutation('vendor_add_product', { data }, '');
  }

  removeProduct(data: RemoveProductFromVendorInput): Promise<unknown> {
    return this.runMutation('vendor_remove_product', { data }, '');
  }
}
