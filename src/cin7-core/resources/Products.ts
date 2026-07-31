import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, WritableResource } from './base/Resource';
import {
  Product,
  ProductAvailability,
  ProductAvailabilitySchema,
  ProductCategory,
  ProductCategorySchema,
  ProductFamily,
  ProductFamilySchema,
  ProductSchema
} from './types/Products';

/** https://dearinventory.docs.apiary.io/#reference/product */
export default class Products extends WritableResource<typeof ProductSchema> {
  readonly availability: ReadableResource<typeof ProductAvailabilitySchema>;
  readonly categories: WritableResource<typeof ProductCategorySchema>;
  readonly families: WritableResource<typeof ProductFamilySchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/product', ProductSchema, 'Products', options);

    this.availability = new ReadableResource(
      axios,
      '/ref/productavailability',
      ProductAvailabilitySchema,
      'ProductAvailabilityList',
      options
    );
    this.categories = new WritableResource(
      axios,
      '/ref/category',
      ProductCategorySchema,
      'CategoryList',
      options
    );
    this.families = new WritableResource(
      axios,
      '/productFamily',
      ProductFamilySchema,
      'ProductFamilyList',
      options
    );
  }

  /** Fetches products whose SKU starts with the given value. */
  async getBySku(sku: string, params: QueryOptions = {}): Promise<Product[]> {
    return this.listAll({ ...params, Sku: sku });
  }

  /** Fetches products whose name starts with the given value. */
  async getByName(name: string, params: QueryOptions = {}): Promise<Product[]> {
    return this.listAll({ ...params, Name: name });
  }

  async getAvailability(params: QueryOptions = {}) {
    return this.availability.list(params);
  }
}

export type { Product, ProductAvailability, ProductCategory, ProductFamily };
