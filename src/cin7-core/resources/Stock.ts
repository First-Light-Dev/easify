import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, WritableResource } from './base/Resource';
import {
  InventoryWriteOff,
  InventoryWriteOffListSchema,
  InventoryWriteOffSchema,
  NewStockLine,
  StockAdjustment,
  StockAdjustmentListSchema,
  StockAdjustmentSchema,
  StockTake,
  StockTakeListSchema,
  StockTakeSchema,
  StockTransfer,
  StockTransferLine,
  StockTransferListSchema,
  StockTransferSchema
} from './types/Stock';

/** https://dearinventory.docs.apiary.io/#reference/stock */
export default class Stock {
  readonly adjustments: WritableResource<typeof StockAdjustmentSchema>;
  readonly adjustmentList: ReadableResource<typeof StockAdjustmentListSchema>;
  readonly takes: WritableResource<typeof StockTakeSchema>;
  readonly takeList: ReadableResource<typeof StockTakeListSchema>;
  readonly transfers: WritableResource<typeof StockTransferSchema>;
  readonly transferList: ReadableResource<typeof StockTransferListSchema>;
  readonly writeOffs: WritableResource<typeof InventoryWriteOffSchema>;
  readonly writeOffList: ReadableResource<typeof InventoryWriteOffListSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    this.adjustments = new WritableResource(
      axios,
      '/stockadjustment',
      StockAdjustmentSchema,
      'StockAdjustmentList',
      { ...options, idParam: 'TaskID' }
    );
    this.adjustmentList = new ReadableResource(
      axios,
      '/stockadjustmentList',
      StockAdjustmentListSchema,
      'StockAdjustmentList',
      options
    );
    this.takes = new WritableResource(
      axios,
      '/stocktake',
      StockTakeSchema,
      'StockTakeList',
      { ...options, idParam: 'TaskID' }
    );
    this.takeList = new ReadableResource(
      axios,
      '/stockTakeList',
      StockTakeListSchema,
      'StockTakeList',
      options
    );
    this.transfers = new WritableResource(
      axios,
      '/stockTransfer',
      StockTransferSchema,
      'StockTransferList',
      { ...options, idParam: 'TaskID' }
    );
    this.transferList = new ReadableResource(
      axios,
      '/stockTransferList',
      StockTransferListSchema,
      'StockTransferList',
      options
    );
    this.writeOffs = new WritableResource(
      axios,
      '/inventoryWriteOff',
      InventoryWriteOffSchema,
      'InventoryWriteOffList',
      { ...options, idParam: 'TaskID' }
    );
    this.writeOffList = new ReadableResource(
      axios,
      '/inventoryWriteOffList',
      InventoryWriteOffListSchema,
      'InventoryWriteOffList',
      options
    );
  }

  listAdjustments(params: QueryOptions = {}) {
    return this.adjustmentList.list(params);
  }

  listTakes(params: QueryOptions = {}) {
    return this.takeList.list(params);
  }

  listTransfers(params: QueryOptions = {}) {
    return this.transferList.list(params);
  }

  /** Transfers in a given status, e.g. `DRAFT`, `IN TRANSIT`, `COMPLETED`, `VOIDED`. */
  listTransfersByStatus(status: StockTransferStatus, params: QueryOptions = {}) {
    return this.transferList.listAll({ ...params, Status: status });
  }

  /**
   * Moves a transfer to `IN TRANSIT`. Cin7 requires an in-transit asset account and a
   * departure date at this status, so both are re-sent with the update.
   */
  async markTransferInTransit(
    taskId: string,
    options: { inTransitAccount: string; departureDate?: Date | string }
  ): Promise<StockTransfer> {
    const transfer = await this.transfers.get(taskId);
    const departure = options.departureDate ?? new Date();

    return this.transfers.update({
      ...transfer,
      TaskID: taskId,
      Status: 'IN TRANSIT',
      InTransitAccount: options.inTransitAccount,
      DepartureDate:
        departure instanceof Date ? departure.toISOString() : departure
    });
  }

  /** Moves a transfer to `COMPLETED`, stamping the completion date. */
  async markTransferCompleted(
    taskId: string,
    completionDate?: Date | string
  ): Promise<StockTransfer> {
    const transfer = await this.transfers.get(taskId);
    const completed = completionDate ?? new Date();

    return this.transfers.update({
      ...transfer,
      TaskID: taskId,
      Status: 'COMPLETED',
      CompletionDate:
        completed instanceof Date ? completed.toISOString() : completed
    });
  }

  /**
   * Creates a stock adjustment, e.g. to push a warehouse write-off back into Cin7.
   * `Status` is deliberately required — `COMPLETED` moves stock the moment it posts,
   * so that has to be asked for rather than inherited from a default.
   * `Lines` uses the New Stock Line shape (`SKU`/`ProductID`, `Quantity`, `Location`, …).
   */
  async createAdjustment(adjustment: StockAdjustmentUpsert): Promise<StockAdjustment> {
    return this.adjustments.create({
      ...adjustment,
      EffectiveDate: adjustment.EffectiveDate ?? new Date().toISOString()
    } as StockAdjustment);
  }
}

/** Statuses Cin7 Core accepts on a stock transfer. */
export type StockTransferStatus = 'DRAFT' | 'IN TRANSIT' | 'COMPLETED' | 'VOIDED';

/** Body accepted by POST/PUT `/stockadjustment`. */
export interface StockAdjustmentUpsert {
  /** Required for updates. */
  TaskID?: string;
  /** Date of the transaction. Defaults to now. */
  EffectiveDate?: string;
  /**
   * `DRAFT` leaves the adjustment in Cin7 for someone to review and authorise;
   * `COMPLETED` moves stock immediately. Required — there is no safe default.
   */
  Status: 'DRAFT' | 'COMPLETED';
  /** Expense account for the adjustment. */
  Account?: string;
  Reference?: string;
  Comment?: string;
  /** Adjusts on-hand quantity when true, otherwise available quantity. */
  UpdateOnHand?: boolean;
  /**
   * New Stock Line shape. `Quantity` is the new on-hand value and either `SKU` or
   * `ProductID` is required, as is either `Location` or `LocationID`.
   */
  Lines: NewStockLine[];
}

export type {
  StockAdjustment,
  StockTake,
  StockTransfer,
  InventoryWriteOff,
  NewStockLine,
  StockTransferLine
};
