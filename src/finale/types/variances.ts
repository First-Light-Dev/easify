/**
 * Finale inventory variance types — what a physical count found, and the source for stock
 * corrections a consuming system may want to apply.
 *
 * A variance carries `physicalInventoryId`, the count date, and `inventoryItemVarianceList`
 * with a signed `quantityOnHandVar` per product: negative for stock missing, positive for
 * stock found.
 *
 * `physicalInventoryTypeId` is Finale's own classification of the count. Where it is set, it
 * is a better signal than parsing free text in `generalComments` for whether a variance is a
 * routine adjustment or a write-off, because a structured field cannot be mistyped by whoever
 * did the count.
 *
 * Variance responses are column-major like every other Finale collection — see
 * `transposeCollection`.
 */

/** One product's variance within a physical inventory. */
export interface FinaleVarianceLine {
  productUrl?: string;
  /**
   * Signed difference between counted and expected on-hand. Negative means stock lost.
   *
       * Passed through untransformed. A consuming system may expect a delta or an absolute
     * on-hand figure; converting between the two needs the current stock level, so that
     * decision belongs in the caller's mapper rather than hidden here.
   */
  quantityOnHandVar?: number;
  facilityUrl?: string;
  [key: string]: unknown;
}

/**
 * A physical inventory / variance record.
 *
 * Only **committed** variances should be synced: an in-progress count is not a fact yet,
 * acting on one risks correcting stock twice — once mid-count and again when it finishes.
 */
export interface FinaleVariance {
  /** Full record URL. The trailing segment is the id callers correlate by. */
  physicalInventoryUrl?: string;
  physicalInventoryId?: string;
  /** Date the count applies to, as opposed to when it was entered. */
  physicalInventoryDate?: string;
  /**
   * Finale's own classification of the variance.
   *
   * Where set, this classifies the count and is a more reliable signal than parsing
   * `generalComments`. See the file header.
   */
  physicalInventoryTypeId?: string;
  /** Header-level comments. Where a reason code is most likely recorded. */
  generalComments?: string;
  /** Lifecycle status of the count. Only a committed variance should be acted on. */
  statusId?: string;
  statusIdHistoryList?: unknown[];
  /** Header-level facility. Unlike orders, variances carry one location, not two. */
  facilityUrl?: string;
  createdDate?: string;
  /** What the poller watermarks on. */
  lastUpdatedDate?: string;
  createdUserLoginId?: string;
  lastUpdatedUserLoginId?: string;
  /** Present only while the variance can still be committed or cancelled. */
  actionUrlCommit?: string;
  actionUrlCancel?: string;
  /** Order this variance was raised against, when any. */
  primaryOrderUrl?: string;
  inventoryItemVarianceList?: FinaleVarianceLine[];
  [key: string]: unknown;
}

/** Filters for listing variances. Values become `[value, value]` exact-match ranges. */
export interface FinaleVarianceQuery {
  facilityUrl?: string;
  statusId?: string;
  physicalInventoryTypeId?: string;
}
