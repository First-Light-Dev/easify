# Cin7 Omni

A TypeScript client for the [Cin7 Omni API](https://api.cin7.com/api/Help), covering every documented
controller with Zod schemas generated directly from Cin7's published OpenAPI spec.

> Cin7 Omni and Cin7 Core are different products with different APIs. This module targets Omni
> (`https://api.cin7.com/api`).

## Quick Start

```typescript
import { Cin7Omni } from '@first-light-dev/easify/cin7-omni';

const cin7 = new Cin7Omni({
  auth: {
    username: process.env.CIN7_API_USERNAME!,
    apiKey: process.env.CIN7_API_KEY!
  }
});

const order = await cin7.salesOrders.getByReference('SALE4-28');
const recent = await cin7.salesOrders.modifiedSince(new Date(Date.now() - 60 * 60 * 1000));
```

## Configuration

```typescript
interface Cin7OmniConfig {
  auth: {
    username: string; // API connection username from Cin7 > Integrations > API
    apiKey: string;
  };
  options?: {
    baseURL?: string; // Override the API root, mainly for testing
    validate?: boolean; // Parse responses with the generated schemas (default: true)
    log?: boolean; // Log every request and response (default: false)
    maxRetries?: number; // Retries for rate-limited requests (default: 5, max: 10)
    multiAPIKeyHandling?: {
      enabled: boolean;
      additionalAPIKeys: string[];
      keyCounter: APICallCounter;
      cutoffAPICallCount?: number; // default: 4900
    };
  };
}
```

### Rate limits

Cin7 allows 3 calls per second, 60 per minute and 5000 per day. The client retries 429 responses
with exponential backoff and jitter. If a single key's daily quota is not enough, supply extra keys
through `multiAPIKeyHandling` along with an `APICallCounter` backed by storage you reset daily:

```typescript
const cin7 = new Cin7Omni({
  auth: { username, apiKey },
  options: {
    multiAPIKeyHandling: {
      enabled: true,
      additionalAPIKeys: [secondKey, thirdKey],
      keyCounter, // implements get(), increment(key), reset()
      cutoffAPICallCount: 4900
    }
  }
});
```

## Resources

Every resource is available on the client instance:

| Client property | Endpoint | Access |
| --- | --- | --- |
| `adjustments` | `/v1/Adjustments` | read/write |
| `bomMasters` | `/v1/BomMasters`, `/v2/BomMasters` | read |
| `branches` | `/v1/Branches` | read/write |
| `branchTransfers` | `/v1/BranchTransfers` | read/write |
| `cartons` | `/v1/Cartons` | read/replace |
| `contacts` | `/v1/Contacts` | read/write/delete |
| `creditNotes` | `/v1/CreditNotes` | read/write |
| `feesAndPayouts` | `/v1/PaymentFeesAndPayouts` | read |
| `payments` | `/v1/Payments` | read/write/delete |
| `productCategories` | `/v1/ProductCategories` | read/write |
| `productImages` | `/v1/ProductImages` | upload |
| `productionJobs` | `/v1/ProductionJobs` | read/write |
| `productOptions` | `/v1/ProductOptions` | read/write |
| `products` | `/v1/Products` | read/write |
| `purchaseOrders` | `/v1/PurchaseOrders` | read/write |
| `quotes` | `/v1/Quotes` | read/write |
| `salesOrders` | `/v1/SalesOrders` | read/write |
| `salesOrdersWithCartons` | `/v1/SalesOrdersWithCartons` | read |
| `serialNumbers` | `/v1/SerialNumbers` | read |
| `sizeRanges` | `/v1/SizeRanges` | read |
| `stock` | `/v1/Stock` | read |
| `users` | `/v1/Users` | read |
| `vouchers` | `/v1/Voucher` | read |

### Shared read methods

| Method | Description |
| --- | --- |
| `get(id)` | Fetches one record by id |
| `list(options?)` | Fetches a single page |
| `where(clause, options?)` | Shorthand for `list({ where })` |
| `pages(options?)` | Async generator yielding one page at a time |
| `listAll(options?)` | Follows paging and returns everything |
| `modifiedSince(date, options?)` | Every record with `modifiedDate >=` the given date |
| `createdSince(date, options?)` | Every record with `createdDate >=` the given date |

`list`, `where`, `pages` and `listAll` accept Cin7's query parameters:

```typescript
const orders = await cin7.salesOrders.list({
  fields: 'id,reference,lineItems(code)',
  where: "stage='Dispatched'",
  order: 'createdDate ASC',
  page: 1,
  rows: 250 // maximum
});
```

For large exports, stream page by page instead of buffering everything:

```typescript
for await (const page of cin7.salesOrders.pages({ where: "modifiedDate>='2026-01-01T00:00:00Z'" })) {
  await handle(page);
}
```

### Shared write methods

Cin7's create and update endpoints are batch endpoints. `create` and `update` send a single record
and throw a `Cin7OmniUpsertError` if Cin7 rejects it; `createMany` and `updateMany` send a batch and
return the per-record results so you can decide what to do with partial failures.

```typescript
import { Cin7OmniUpsertError } from '@first-light-dev/easify/cin7-omni';

try {
  const result = await cin7.salesOrders.create({
    reference: 'WEB-1001',
    memberEmail: 'alex@acompany.com',
    stage: 'New',
    lineItems: [{ code: 'SKU-1', qty: 2, unitPrice: 19.95 }]
  });
  console.log('Created order', result.id);
} catch (error) {
  if (error instanceof Cin7OmniUpsertError) {
    console.error(error.results); // every record's index, success flag and errors
  }
}

const results = await cin7.salesOrders.updateMany([
  { id: 1, stage: 'Dispatched' },
  { id: 2, stage: 'Dispatched' }
]);
const failed = results.filter((result) => !result.success);
```

`PurchaseOrders`, `Quotes` and `SalesOrders` accept Cin7's `loadboms` flag as a second argument:

```typescript
await cin7.purchaseOrders.create(order, { loadboms: true });
```

### Resource-specific helpers

```typescript
await cin7.salesOrders.getByReference('SALE4-28');
await cin7.salesOrders.getByReferences(['SALE4-28', 'SALE4-29']);
await cin7.salesOrders.void(128); // irreversible in Cin7
await cin7.salesOrders.setStage(128, 'Dispatched');

await cin7.products.getByStyleCode('SHIRT-01');
await cin7.productOptions.getByBarcode('9312345678900');
await cin7.stock.getByBarcode('9312345678900');
await cin7.contacts.getByEmail('alex@acompany.com');
await cin7.vouchers.getByCode('XMAS');

await cin7.cartons.getBySalesOrderId(128);
await cin7.cartons.replace(128, [{ number: '1', sscc: '00012345678905' }]);

await cin7.feesAndPayouts.fees({ where: "createdDate>='2026-01-01T00:00:00Z'" });
await cin7.productImages.upload({ productId: 120, imagePriority: 'Primary', file: bytes });
```

## Types and validation

Every schema and its inferred type is exported, including nested objects:

```typescript
import {
  SalesOrder,
  SalesOrderLineItem,
  SalesOrderSchema
} from '@first-light-dev/easify/cin7-omni';
```

Responses are parsed with these schemas by default. Three deliberate choices keep that safe against
a live API:

- **Every field is optional and nullable.** Cin7 nulls unset fields, and the `fields` parameter
  returns partial records.
- **Schemas are loose.** Fields Cin7 adds later are preserved rather than stripped.
- **Documented enums are typed as `string`.** The spec's casing does not always match what the API
  sends, so allowed values are listed in each field's doc comment instead of enforced.

Set `options.validate: false` to skip parsing entirely and return raw responses.

## Regenerating the types

`src/cin7-omni/resources/types` is generated from Cin7's published OpenAPI spec. When Cin7 updates
their API:

```bash
yarn codegen:cin7-omni                       # fetches the live spec
yarn codegen:cin7-omni --spec ./spec.json    # or generate from a local copy
```

The generator lives in `src/scripts/cin7-omni-codegen.ts`, formats its own output and is
idempotent. It also handles two quirks of the published spec: property names are converted with
Newtonsoft's camel casing rules (so `SSCCNumber` becomes `ssccNumber`), and known inaccuracies such
as `customFields` are corrected through a documented override table.
