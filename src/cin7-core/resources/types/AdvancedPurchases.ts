import { z } from 'zod';

/**
 * Advanced Purchase models.
 * https://dearinventory.docs.apiary.io/#reference/purchase/advanced-purchase
 *
 * Hand-written rather than generated: the blueprint reuses the simple-purchase table
 * titles ("Purchase Stock Received", "Purchase Invoice", ...) for the advanced
 * endpoints, so the generator cannot tell the two apart.
 */

/** A single received line on an advanced purchase stock receipt. */
export const AdvancedPurchaseStockLineSchema = z.looseObject({
  /** Date when items were received. */
  Date: z.string().nullable().optional(),
  /** Received quantity. Minimum 1. */
  Quantity: z.number().nullable().optional(),
  /** Product identifier referenced by this line. Required unless SKU is given. */
  ProductID: z.string().nullable().optional(),
  /** Product SKU referenced by this line. Required unless ProductID is given. */
  SKU: z.string().nullable().optional(),
  /** Product name. Read-only. */
  Name: z.string().nullable().optional(),
  /** Location the product is received into. */
  Location: z.string().nullable().optional(),
  LocationID: z.string().nullable().optional(),
  /** Whether the items were received. Read-only. */
  Received: z.boolean().nullable().optional(),
  /** Batch or serial number. */
  BatchSN: z.string().nullable().optional(),
  SupplierSKU: z.string().nullable().optional(),
  /** Date the selected batch expires. */
  ExpiryDate: z.string().nullable().optional()
});

export type AdvancedPurchaseStockLine = z.infer<typeof AdvancedPurchaseStockLineSchema>;

/** One stock-receiving task within an advanced purchase. */
export const AdvancedPurchaseStockTaskSchema = z.looseObject({
  /** Unique stock receiving task id. */
  TaskID: z.string().nullable().optional(),
  /** `NOT AVAILABLE`, `DRAFT`, `AUTHORISED` or `VOIDED`. POST/PUT accept DRAFT and AUTHORISED. */
  Status: z.string().nullable().optional(),
  Lines: z.array(AdvancedPurchaseStockLineSchema).nullable().optional()
});

export type AdvancedPurchaseStockTask = z.infer<typeof AdvancedPurchaseStockTaskSchema>;

/** `GET /advanced-purchase/stock?PurchaseID=` response. */
export const AdvancedPurchaseStockSchema = z.looseObject({
  /** Unique purchase master task id. */
  PurchaseID: z.string().nullable().optional(),
  StockReceiving: z.array(AdvancedPurchaseStockTaskSchema).nullable().optional()
});

export type AdvancedPurchaseStock = z.infer<typeof AdvancedPurchaseStockSchema>;

/** Body accepted by POST/PUT `/advanced-purchase/stock`. */
export const AdvancedPurchaseStockUpsertSchema = z.looseObject({
  PurchaseID: z.string(),
  TaskID: z.string().nullable().optional(),
  Status: z.string(),
  Lines: z.array(AdvancedPurchaseStockLineSchema)
});

export type AdvancedPurchaseStockUpsert = z.infer<typeof AdvancedPurchaseStockUpsertSchema>;

/** A put-away line; mirrors the stock line but targets a bin. */
export const AdvancedPurchasePutAwayLineSchema = AdvancedPurchaseStockLineSchema;

export type AdvancedPurchasePutAwayLine = z.infer<typeof AdvancedPurchasePutAwayLineSchema>;

export const AdvancedPurchasePutAwaySchema = z.looseObject({
  PurchaseID: z.string().nullable().optional(),
  TaskID: z.string().nullable().optional(),
  Status: z.string().nullable().optional(),
  PutAway: z.array(z.unknown()).nullable().optional(),
  Lines: z.array(AdvancedPurchasePutAwayLineSchema).nullable().optional()
});

export type AdvancedPurchasePutAway = z.infer<typeof AdvancedPurchasePutAwaySchema>;

export const AdvancedPurchaseInvoiceSchema = z.looseObject({
  PurchaseID: z.string().nullable().optional(),
  Invoices: z.array(z.unknown()).nullable().optional()
});

export type AdvancedPurchaseInvoice = z.infer<typeof AdvancedPurchaseInvoiceSchema>;

export const AdvancedPurchaseCreditNoteSchema = z.looseObject({
  PurchaseID: z.string().nullable().optional(),
  CreditNotes: z.array(z.unknown()).nullable().optional()
});

export type AdvancedPurchaseCreditNote = z.infer<typeof AdvancedPurchaseCreditNoteSchema>;

export const AdvancedPurchasePaymentSchema = z.looseObject({
  PurchaseID: z.string().nullable().optional(),
  Payments: z.array(z.unknown()).nullable().optional()
});

export type AdvancedPurchasePayment = z.infer<typeof AdvancedPurchasePaymentSchema>;

export const AdvancedPurchaseManualJournalSchema = z.looseObject({
  PurchaseID: z.string().nullable().optional(),
  ManualJournals: z.array(z.unknown()).nullable().optional()
});

export type AdvancedPurchaseManualJournal = z.infer<typeof AdvancedPurchaseManualJournalSchema>;
