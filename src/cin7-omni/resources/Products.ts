import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { Product, ProductCreateSchema, ProductSchema, ProductUpdateSchema } from './types/Products';

/** https://api.cin7.com/api/Help#Products */
export default class Products extends WritableResource<
  typeof ProductSchema,
  typeof ProductCreateSchema,
  typeof ProductUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Products', ProductSchema, ProductCreateSchema, ProductUpdateSchema, options);
  }

  /** Fetches the product with the given style code. */
  async getByStyleCode(styleCode: string): Promise<Product | undefined> {
    const [product] = await this.list({ where: `styleCode=${whereValue(styleCode)}`, rows: 1 });
    return product;
  }

  /**
   * Fetches every product in a category. Cin7 stores the category ids as a delimited string,
   * so this matches with LIKE as the documentation recommends.
   */
  async getByCategoryId(categoryId: number, options: QueryOptions = {}): Promise<Product[]> {
    return this.listAll({ ...options, where: `categoryIdArray LIKE '%${categoryId}%'` });
  }
}
