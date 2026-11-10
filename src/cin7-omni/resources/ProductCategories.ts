import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  ProductCategory,
  ProductCategoryCreateSchema,
  ProductCategorySchema,
  ProductCategoryUpdateSchema
} from './types/ProductCategories';

/** https://api.cin7.com/api/Help#ProductCategories */
export default class ProductCategories extends WritableResource<
  typeof ProductCategorySchema,
  typeof ProductCategoryCreateSchema,
  typeof ProductCategoryUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/ProductCategories',
      ProductCategorySchema,
      ProductCategoryCreateSchema,
      ProductCategoryUpdateSchema,
      options
    );
  }

  /** Fetches the category with the given name. */
  async getByName(name: string): Promise<ProductCategory | undefined> {
    const [category] = await this.list({ where: `name=${whereValue(name)}`, rows: 1 });
    return category;
  }

  /** Fetches the direct children of a category. */
  async getChildren(parentId: number, options: QueryOptions = {}): Promise<ProductCategory[]> {
    return this.listAll({ ...options, where: `parentId=${parentId}` });
  }
}
