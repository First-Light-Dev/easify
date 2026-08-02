import type {
  DeleteWarehouseProductInput,
  InventoryGenerateSnapshotInput,
  ReplaceInventoryInput,
  TransferInventoryInput,
  UpdateInventoryInput,
  UpdateWarehouseProductInput
} from '../generated/inputs';
import type {
  InventoryChange,
  InventorySnapshot,
  ItemLocation,
  WarehouseProduct
} from '../generated/objects';
import type {
  InventoryChangesQueryArgs,
  InventorySnapshotsQueryArgs,
  ItemLocationsQueryArgs,
  WarehouseProductsQueryArgs
} from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  dateWindows,
  toISO
} from './base/Resource';
import {
  INVENTORY_CHANGE,
  INVENTORY_SNAPSHOT,
  ITEM_LOCATION,
  WAREHOUSE_PRODUCT
} from './base/selections';

/** ShipHero caps a reason-filtered `inventory_changes` query at a 60 day range. */
export const INVENTORY_CHANGE_MAX_WINDOW_DAYS = 60;

export interface AdjustmentPollOptions extends ListAllOptions {
  /**
   * Only return changes whose reason contains one of these strings. Matching is a
   * case-insensitive contains, mirroring ShipHero's own `reason` filter.
   */
  reasons?: string[];
  /** Restrict to a warehouse. */
  warehouseId?: string;
  /** Drop changes that came from a cycle count. Defaults to false. */
  excludeCycleCounts?: boolean;
}

/**
 * Stock levels and stock movements.
 *
 * ShipHero has no dedicated write-off document: an adjustment made in the warehouse
 * shows up as an `inventory_changes` row with a free-text `reason`. Agree on a reason
 * keyword with the warehouse team and poll {@link adjustmentsSince} for it.
 *
 * ```ts
 * const stock = await shiphero.inventory.listAll({ warehouse_id: warehouseId });
 * const writeOffs = await shiphero.inventory.adjustmentsSince(lastRun, {
 *   reasons: ['Damaged', 'Write-off']
 * });
 * ```
 */
export default class Inventory extends BaseResource {
  // -------------------------------------------------------------------------
  // Stock levels
  // -------------------------------------------------------------------------

  /** A page of warehouse-scoped stock records. */
  page(
    args: WarehouseProductsQueryArgs = {},
    options: PageOptions = {}
  ): Promise<Page<WarehouseProduct>> {
    return this.fetchPage<WarehouseProduct>('warehouse_products', args, WAREHOUSE_PRODUCT, options);
  }

  pages(args: WarehouseProductsQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<WarehouseProduct>(
      'warehouse_products',
      args,
      WAREHOUSE_PRODUCT,
      options
    );
  }

  listAll(
    args: WarehouseProductsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<WarehouseProduct[]> {
    return this.collect<WarehouseProduct>('warehouse_products', args, WAREHOUSE_PRODUCT, options);
  }

  /** Stock records changed at or after `since`, for incremental level syncs. */
  updatedSince(
    since: Date | string,
    args: WarehouseProductsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<WarehouseProduct[]> {
    return this.listAll({ ...args, updated_from: toISO(since) }, options);
  }

  /** The stock record for one SKU in one warehouse. */
  async getBySku(
    sku: string,
    warehouseId?: string,
    options: GetOptions = {}
  ): Promise<WarehouseProduct | undefined> {
    const [record] = await this.collect<WarehouseProduct>(
      'warehouse_products',
      { sku, warehouse_id: warehouseId },
      options.selection ?? WAREHOUSE_PRODUCT,
      { max: 1 }
    );
    return record;
  }

  /** Bin-level quantities. */
  itemLocations(
    args: ItemLocationsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<ItemLocation[]> {
    return this.collect<ItemLocation>('item_locations', args, ITEM_LOCATION, options);
  }

  // -------------------------------------------------------------------------
  // Stock movements
  // -------------------------------------------------------------------------

  /** A page of inventory changes. */
  changesPage(
    args: InventoryChangesQueryArgs = {},
    options: PageOptions = {}
  ): Promise<Page<InventoryChange>> {
    return this.fetchPage<InventoryChange>('inventory_changes', args, INVENTORY_CHANGE, options);
  }

  /**
   * Every inventory change in a date range, splitting the range into 60 day windows
   * because ShipHero rejects anything wider when `reason` is set.
   */
  async changes(
    from: Date | string,
    to: Date | string = new Date(),
    args: InventoryChangesQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InventoryChange[]> {
    const changes: InventoryChange[] = [];

    for (const window of dateWindows(from, to, INVENTORY_CHANGE_MAX_WINDOW_DAYS)) {
      changes.push(
        ...(await this.collect<InventoryChange>(
          'inventory_changes',
          { ...args, date_from: window.from, date_to: window.to },
          INVENTORY_CHANGE,
          options
        ))
      );

      if (options.max !== undefined && changes.length >= options.max) {
        return changes.slice(0, options.max);
      }
    }

    return changes;
  }

  /**
   * Manual stock adjustments since `since`, identified by their reason text.
   *
   * ShipHero writes every movement to `inventory_changes`, including sales,
   * receiving and cycle counts, so a write-off is only distinguishable by the reason
   * the operator selected. Pass the reason keywords your warehouse uses; without them
   * this returns every change in the window.
   */
  async adjustmentsSince(
    since: Date | string,
    options: AdjustmentPollOptions = {}
  ): Promise<InventoryChange[]> {
    const { reasons, warehouseId, excludeCycleCounts, ...pageOptions } = options;
    const to = new Date();

    // ShipHero's reason filter takes a single value, so each keyword is its own pass.
    const passes = reasons?.length ? reasons : [undefined];
    const seen = new Set<string>();
    const changes: InventoryChange[] = [];

    for (const reason of passes) {
      for (const change of await this.changes(
        since,
        to,
        { reason, warehouse_id: warehouseId },
        pageOptions
      )) {
        const key = change.id ?? `${change.sku}:${change.created_at}:${change.change_in_on_hand}`;
        if (seen.has(key)) continue;
        if (excludeCycleCounts && change.cycle_counted) continue;
        seen.add(key);
        changes.push(change);
      }
    }

    return changes.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  }

  /** Adds stock, recording `reason` on the resulting inventory change. */
  add(data: UpdateInventoryInput, options: MutateOptions = {}): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'inventory_add',
      { data },
      options.selection ?? WAREHOUSE_PRODUCT,
      options
    );
  }

  /** Removes stock, recording `reason` on the resulting inventory change. */
  remove(data: UpdateInventoryInput, options: MutateOptions = {}): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'inventory_remove',
      { data },
      options.selection ?? WAREHOUSE_PRODUCT,
      options
    );
  }

  /** Decrements stock by `quantity`, as opposed to {@link remove}, which clears a location. */
  subtract(data: UpdateInventoryInput, options: MutateOptions = {}): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'inventory_subtract',
      { data },
      options.selection ?? WAREHOUSE_PRODUCT,
      options
    );
  }

  /** Sets stock to an absolute quantity. */
  replace(data: ReplaceInventoryInput, options: MutateOptions = {}): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'inventory_replace',
      { data },
      options.selection ?? WAREHOUSE_PRODUCT,
      options
    );
  }

  /** Moves stock between locations or warehouses. */
  transfer(data: TransferInventoryInput): Promise<unknown> {
    return this.runMutation('inventory_transfer', { data }, '');
  }

  updateWarehouseProduct(
    data: UpdateWarehouseProductInput,
    options: MutateOptions = {}
  ): Promise<WarehouseProduct> {
    return this.runMutation<WarehouseProduct>(
      'warehouse_product_update',
      { data },
      options.selection ?? WAREHOUSE_PRODUCT,
      options
    );
  }

  deleteWarehouseProduct(data: DeleteWarehouseProductInput): Promise<unknown> {
    return this.runMutation('warehouse_product_delete', { data }, '');
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  /**
   * Queues a full inventory snapshot. Snapshots are the cheap way to reconcile a
   * whole catalogue: one request produces a downloadable file instead of thousands of
   * credits worth of paging.
   */
  generateSnapshot(
    data: InventoryGenerateSnapshotInput,
    options: MutateOptions = {}
  ): Promise<InventorySnapshot> {
    return this.runMutation<InventorySnapshot>(
      'inventory_generate_snapshot',
      { data },
      options.selection ?? INVENTORY_SNAPSHOT,
      options
    );
  }

  /** Polls one snapshot; `snapshot_url` is populated once `status` is complete. */
  snapshot(snapshotId: string, options: GetOptions = {}): Promise<InventorySnapshot | null> {
    return this.fetchObject<InventorySnapshot>(
      'inventory_snapshot',
      { snapshot_id: snapshotId },
      INVENTORY_SNAPSHOT,
      options
    );
  }

  snapshots(
    args: InventorySnapshotsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<InventorySnapshot[]> {
    return this.collect<InventorySnapshot>(
      'inventory_snapshots',
      args,
      INVENTORY_SNAPSHOT,
      options
    );
  }
}
