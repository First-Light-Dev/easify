import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, WritableResource } from './base/Resource';
import {
  Disassembly,
  DisassemblySchema,
  FinishedGoods,
  FinishedGoodsSchema,
  Journal,
  JournalSchema,
  ProductionOrder,
  ProductionOrderListItem,
  ProductionOrderSchema
} from './types/Production';
import { z } from 'zod';

const ProductionOrderListSchema = z.looseObject({
  ID: z.string().nullable().optional(),
  OrderNumber: z.string().nullable().optional(),
  Status: z.string().nullable().optional(),
  ProductCode: z.string().nullable().optional(),
  ProductName: z.string().nullable().optional()
}) as z.ZodType<ProductionOrderListItem>;

/** https://dearinventory.docs.apiary.io/#reference/production */
export default class Production {
  readonly orders: WritableResource<typeof ProductionOrderSchema>;
  readonly orderList: ReadableResource<z.ZodType<ProductionOrderListItem>>;
  readonly finishedGoods: WritableResource<typeof FinishedGoodsSchema>;
  readonly disassemblies: WritableResource<typeof DisassemblySchema>;
  readonly journals: WritableResource<typeof JournalSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    this.orders = new WritableResource(
      axios,
      '/production/order',
      ProductionOrderSchema,
      'ProductionOrderList',
      { ...options, idParam: 'ProductionOrderID' }
    );
    this.orderList = new ReadableResource(
      axios,
      '/production/orderList',
      ProductionOrderListSchema,
      'ProductionOrderList',
      options
    );
    this.finishedGoods = new WritableResource(
      axios,
      '/finishedGoods',
      FinishedGoodsSchema,
      'FinishedGoodsList',
      { ...options, idParam: 'TaskID' }
    );
    this.disassemblies = new WritableResource(
      axios,
      '/disassembly',
      DisassemblySchema,
      'DisassemblyList',
      { ...options, idParam: 'TaskID' }
    );
    this.journals = new WritableResource(
      axios,
      '/journal',
      JournalSchema,
      'JournalList',
      { ...options, idParam: 'TaskID' }
    );
  }

  listOrders(params: QueryOptions = {}) {
    return this.orderList.list(params);
  }
}

export type { ProductionOrder, ProductionOrderListItem, FinishedGoods, Disassembly, Journal };
