import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import {
  ProductOption,
  ProductOptionCreateSchema,
  ProductOptionSchema,
  ProductOptionUpdateSchema
} from './types/ProductOptions';

/** https://api.cin7.com/api/Help#ProductOptions */
export default class ProductOptions extends WritableResource<
  typeof ProductOptionSchema,
  typeof ProductOptionCreateSchema,
  typeof ProductOptionUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(
      axios,
      '/v1/ProductOptions',
      ProductOptionSchema,
      ProductOptionCreateSchema,
      ProductOptionUpdateSchema,
      options
    );
  }

  /** Fetches the option with the given SKU. */
  async getByCode(code: string): Promise<ProductOption | undefined> {
    const [option] = await this.list({ where: `code=${whereValue(code)}`, rows: 1 });
    return option;
  }

  /** Fetches the option with the given barcode. */
  async getByBarcode(barcode: string): Promise<ProductOption | undefined> {
    const [option] = await this.list({ where: `barcode=${whereValue(barcode)}`, rows: 1 });
    return option;
  }

  /** Fetches every option belonging to a product. */
  async getByProductId(productId: number, options: QueryOptions = {}): Promise<ProductOption[]> {
    return this.listAll({ ...options, where: `productId=${productId}` });
  }
}
