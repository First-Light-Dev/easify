# Cin7 Core

A TypeScript client for the [Cin7 Core (DEAR Inventory) API v2](https://dearinventory.docs.apiary.io/),
with Zod schemas generated from Cin7's published API Blueprint.

> Cin7 Core and Cin7 Omni are different products with different APIs. This module targets Core
> (`https://inventory.dearsystems.com/ExternalApi/v2`). For Omni see `@first-light-dev/easify/cin7-omni`.

## Quick Start

```typescript
import { Cin7Core } from '@first-light-dev/easify/cin7-core';

const core = new Cin7Core({
  auth: {
    accountId: process.env.CIN7_CORE_ACCOUNT_ID!,
    applicationKey: process.env.CIN7_CORE_APPLICATION_KEY!
  }
});

const sale = await core.sales.getById('916ab4c0-6ccb-4c93-873d-0603859050e4');
const recent = await core.sales.listAll({ UpdatedSince: '2026-01-01T00:00:00' });
```

## Configuration

```typescript
interface Cin7CoreConfig {
  auth: {
    accountId: string; // from Cin7 Core > Integration > API
    applicationKey: string;
  };
  options?: {
    baseURL?: string;
    validate?: boolean; // parse responses with generated schemas (default: true)
    log?: boolean;
    maxRetries?: number; // retries for 429 responses (default: 5, max: 10)
  };
}
```

Authentication uses the `api-auth-accountid` and `api-auth-applicationkey` headers. Cin7 Core
allows 60 calls per minute per application key; the client retries 429 responses with backoff.

## Resources

| Client property | Endpoints | Access |
| --- | --- | --- |
| `sales` | `/sale`, `/saleList`, `/sale/*` | read/write + nested quote/order/fulfilment/invoice/credit note/payment |
| `purchases` | `/purchase`, `/purchaseList`, `/purchase/*` | read/write + nested order/stock/invoice/credit note/payment |
| `advancedPurchases` | `/advanced-purchase/*` | stock received, put away, invoice, credit note, payment, manual journal |
| `products` | `/product`, `/productFamily`, `/ref/category`, `/ref/productavailability` | read/write |
| `customers` | `/customer`, `/ref/customer/credits` | read/write |
| `suppliers` | `/supplier` | read/write |
| `stock` | `/stockadjustment`, `/stocktake`, `/stockTransfer`, `/inventoryWriteOff` | read/write |
| `reference` | `/ref/*` (locations, brands, tax, UOM, payment terms, …) | mixed |
| `production` | `/production/order`, `/finishedGoods`, `/disassembly`, `/journal` | read/write |
| `crm` | `/crm/lead`, `/crm/opportunity` | read/write |
| `account` | `/me`, `/me/addresses`, `/me/contacts`, `/webhooks`, `/transactions` | mixed |

### Shared read methods

| Method | Description |
| --- | --- |
| `get(id)` | Fetches one record by `ID` |
| `list(params?)` | Fetches a single page (`Page` / `Limit`) |
| `pages(params?)` | Async generator yielding pages |
| `listAll(params?)` | Follows paging and returns everything |
| `modifiedSince(date)` | Records with `ModifiedSince` (when supported) |

Page size defaults to 100 and caps at 1000. List responses unwrap Cin7's
`{ Total, Page, XxxList }` envelope into `{ Total, Page, Items }`.

### Nested sale / purchase documents

```typescript
await core.sales.quote.get(saleId);
await core.sales.order.create({ SaleID: saleId, Status: 'AUTHORISED', Lines: [...] });
await core.sales.invoice.create({ SaleID: saleId, Invoices: [...] });
await core.sales.payment.create({ SaleID: saleId, /* payment fields */ });

await core.purchases.order.get(taskId);
await core.purchases.stock.create({ TaskID: taskId, /* lines */ });
```

## 3PL sync helpers

### Purchase orders

`/purchaseList` does not return the header location, so filtering on it needs the detail
call. `listAuthorisedByLocation` does that for you — narrow the candidate set with
`UpdatedSince` to stay inside the 60 calls/minute limit.

```typescript
const pos = await core.purchases.listAuthorisedByLocation('US 3PL Warehouse', {
  UpdatedSince: lastSyncedAt
});

// Pull the 3PL receipt back in with the date the warehouse received it.
await core.advancedPurchases.receiveAuthorised(
  purchaseId,
  [{ SKU: 'GB3-White', Quantity: 11, Location: 'US 3PL Warehouse', BatchSN: '5484153' }],
  receivedAt
);

const receipts = await core.advancedPurchases.getStockReceipts(purchaseId);
const done = await core.advancedPurchases.isFullyReceived(purchaseId);
```

Receipt status is one of `NOT AVAILABLE`, `DRAFT`, `AUTHORISED`, `VOIDED`; POST/PUT accept
only `DRAFT` and `AUTHORISED`. Posting here converts a simple purchase into an advanced one.

### Stock transfers

```typescript
const drafts = await core.stock.listTransfersByStatus('DRAFT');

// Outbound: once ShipHero picks the order.
await core.stock.markTransferInTransit(taskId, { inTransitAccount: 'skip-account-code' });

// Inbound: once the ShipHero inbound shipment is received.
await core.stock.markTransferCompleted(taskId, receivedAt);
```

`IN TRANSIT` requires `InTransitAccount` and `DepartureDate`; both helpers re-send the
existing document so the rest of the transfer is preserved.

### Adjustments

```typescript
await core.stock.createAdjustment({
  Status: 'DRAFT',
  Reference: 'ShipHero write-off 12345',
  Comment: 'Damaged in warehouse',
  Account: '403',
  UpdateOnHand: true,
  Lines: [{ SKU: 'GB3-White', Quantity: -2, Location: 'US 3PL Warehouse' }]
});
```

`Status` is required: `DRAFT` leaves the adjustment for someone to review and authorise
in Cin7, `COMPLETED` moves stock the moment it posts. `EffectiveDate` defaults to now.

## Types and validation

Property names stay **PascalCase** to match the live API. Every field is optional and nullable;
schemas are loose so fields Cin7 adds later are preserved.

```typescript
import { Sale, SaleList, Product, Customer } from '@first-light-dev/easify/cin7-core';
```

Set `options.validate: false` to skip parsing and return raw responses.

## Regenerating the types

```bash
yarn codegen:cin7-core                       # fetches the live Apiary blueprint
yarn codegen:cin7-core --spec ./blueprint.apib
```

The generator lives in `src/scripts/cin7-core-codegen.ts`.
