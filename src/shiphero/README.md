# ShipHero

A TypeScript client for the [ShipHero public GraphQL API](https://developer.shiphero.com/), with
types generated from ShipHero's published schema reference.

The client handles the two things that make ShipHero awkward to use directly: bearer tokens that
expire every 28 days, and a credit-based throttle that punishes unbounded GraphQL queries.

## Quick Start

```typescript
import { ShipHero } from '@first-light-dev/easify/shiphero';

const shiphero = new ShipHero({
  auth: {
    accessToken: process.env.SHIPHERO_ACCESS_TOKEN,
    refreshToken: process.env.SHIPHERO_REFRESH_TOKEN
  }
});

const warehouse = await shiphero.account.warehouseByIdentifier('US 3PL Warehouse');
const changed = await shiphero.products.updatedSince('2026-07-01T00:00:00Z');
```

## Configuration

```typescript
interface ShipHeroConfig {
  auth: {
    accessToken?: string;  // expires 28 days after issue
    refreshToken?: string; // static while the developer user is active
    username?: string;     // password grant, used when no token is supplied
    password?: string;
  };
  options?: {
    graphqlURL?: string;
    authURL?: string;
    customerAccountId?: string;     // default 3PL child account
    log?: boolean;
    maxRetries?: number;            // credit throttling, 429s, 5xx (default: 5, max: 10)
    maxThrottleWaitMs?: number;     // longest wait for credits (default: 60_000)
    maxRequestsPerWindow?: number;  // requests per rolling 5 min (default: 6500)
    maxCredits?: number;            // account credit ceiling (default: 4004)
    onAccessToken?: (token: { accessToken: string; expiresIn: number; expiresAt: Date }) => void;
  };
}
```

### Tokens

Create a third-party developer user under **My Account > Developer Users** in ShipHero and use its
access and refresh tokens; sharing a real user's password is neither necessary nor safe.

Supply both tokens. The client refreshes the access token an hour before it expires and again if
ShipHero rejects it, and concurrent callers share a single refresh round trip. Pass
`onAccessToken` to persist the new token so restarts do not mint another one.

With only a `refreshToken`, the first request mints an access token. With only `username` and
`password`, the client uses the password grant. With only an `accessToken`, it is used until
ShipHero rejects it, and then the request fails with `ShipHeroAuthError`.

### Throttling

ShipHero prices each operation in credits: an account holds 4004 and restores 60 per second. The
estimate is driven by Relay page sizes, and nested connections multiply it — a 100-row query with
100-row line items is estimated at 10001 credits and rejected outright. Unused rows are credited
back, so asking for 50 and receiving 30 costs 30.

The client keeps you inside those limits:

- Every connection query carries an explicit `first`, defaulting to 100.
- Nested connections in the built-in selections carry their own `first` (50 line items, 25
  purchase orders per inbound shipment).
- Credit exhaustion (error code 30) is retried after the delay ShipHero reports. An operation that
  structurally costs more than the account ceiling is not retried, since waiting cannot help it;
  it throws `ShipHeroThrottleError`.
- Separately from credits, ShipHero returns 429 above 7000 requests per rolling five minutes,
  counting failures and introspection. The client paces itself at 6500 by default, leaving
  headroom for other clients on the same account.

Check cost before widening a query:

```typescript
const credits = await shiphero.orders.estimateCost({ updated_from: since }, { first: 50 });
const { credits_remaining, max_available } = await shiphero.account.quota();
```

For full-catalogue reconciliation prefer a snapshot over paging, and prefer webhooks over polling
where possible — neither consumes credits per row.

## Resources

| Client property | Operations | Notes |
| --- | --- | --- |
| `account` | `account`, `me`, `user`, `users`, `user_quota` | warehouses and credit quota |
| `products` | `product`, `products`, `product_create/update/delete`, `product_add_to_warehouse` | catalogue |
| `inventory` | `warehouse_products`, `inventory_changes`, `item_locations`, `inventory_add/remove/subtract/replace/transfer`, snapshots | stock levels and movements |
| `purchaseOrders` | `purchase_order(s)`, `purchase_order_create/update/close/cancel/set_fulfillment_status` | inbound orders and receipts |
| `inboundShipments` | `inbound_shipment(s)`, summaries, `inbound_shipment_create/update` | receiving appointments |
| `orders` | `order(s)`, `order_history`, `order_create/update/cancel/fulfill`, line items, tags, holds | sales and outbound movements |
| `shipments` | `shipment(s)`, `shipment_create`, `shipment_create_shipping_label` | what left the warehouse |
| `returns` | `return(s)`, `return_create/update_status/receive_line_item` | customer returns |
| `vendors` | `vendors`, `vendor_create/delete`, product association | suppliers for purchase orders |
| `locations` | `location(s)`, `location_create/update/delete` | bins |
| `webhooks` | `webhooks`, `webhook_create/update_url/enable/disable/delete` | subscriptions |

Anything not covered is still reachable with the same auth and throttling:

```typescript
const data = await shiphero.query<{ totes: { data: { edges: { node: { id: string } }[] } } }>(
  `query { totes { request_id complexity data(first: 10) { edges { node { id barcode } } } } }`
);
```

## Pagination

Every connection-backed resource exposes the same four shapes:

```typescript
// One page, with the cursor to continue from.
const page = await shiphero.products.page({ sku: 'BLUE-TEE-M' }, { first: 50 });
page.nodes;        // Product[]
page.hasNextPage;  // boolean
page.endCursor;    // string | undefined
page.complexity;   // credits this page actually cost

// Page by page, so a long run does not sit in memory.
for await (const page of shiphero.products.pages({}, { first: 100 })) {
  await sync(page.nodes);
}

// Everything, optionally capped.
const all = await shiphero.products.listAll({}, { max: 500 });
```

Pass `selection` to any of them to override the fields requested, and `sort` to order results
(`'-created_at'` for descending). Selection presets live in the `selections` export and are
verified against the generated schema by `yarn check:shiphero`.

## Integration flows

The helpers below cover the places where ShipHero's model does not line up with an ERP's, and each
one documents the compromise it makes.

### Product sync (ERP to ShipHero)

```typescript
const { product, created } = await shiphero.products.upsert({
  sku: 'BLUE-TEE-M',
  name: 'Blue Tee (M)',
  price: '19.99',
  barcode: '000001'
});
```

ShipHero has no upsert and rejects `product_create` for an existing SKU, so `upsert` looks the SKU
up first. `product_update` accepts fewer fields than `product_create` because price, value and
stock are per-warehouse: set those through `products.addToWarehouse` or the `inventory` resource.

Kits are `kit: true` products with `kit_components`; assemblies are `is_assembly: true` with
`assembly_components`. Both are returned by `products.getBySku` and by
`products.listAllWithInventory`.

### Purchase orders out to the warehouse

```typescript
const warehouse = await shiphero.account.warehouseByIdentifier('US 3PL Warehouse');

await shiphero.purchaseOrders.create({
  po_number: 'PO-100045',
  warehouse_id: warehouse!.id!,
  vendor_id: vendorId,
  po_date: '2026-08-01T00:00:00Z',
  subtotal: '100.00',
  shipping_price: '0.00',
  total_price: '100.00',
  line_items: [
    { sku: 'BLUE-TEE-M', quantity: 10, price: '10.00', expected_weight_in_lbs: '0.5' }
  ]
});
```

### Receipts back from the warehouse

```typescript
for (const receipt of await shiphero.purchaseOrders.receiptsUpdatedSince(lastRun)) {
  for (const line of receipt.lines) {
    await erp.postReceipt(receipt.poNumber, line.sku, line.quantityReceived, line.updatedAt);
  }
  if (receipt.fullyReceived) await erp.closePurchaseOrder(receipt.poNumber);
}
```

ShipHero has no receipt document and no per-receipt timestamp. Received and rejected quantities
live on the purchase order line items, `updated_at` on the line is the closest available date, and
`arrived_at` on the header records the physical arrival. `receiptsUpdatedSince` filters on
`updated_from`, which ShipHero derives from line item updates — exactly what receiving touches —
and drops orders where nothing has been received yet.

For pallet and bin level detail, `inboundShipments.summary` and
`inboundShipments.locationSummary` report what was received into which LPN and bin.

### Inbound transfers

```typescript
const shipment = await shiphero.inboundShipments.create({
  warehouse_id: warehouse!.id!,
  purchase_order_ids: [purchaseOrderId],
  estimated_truck_arrival: '2026-08-04T09:00:00Z'
});

for (const done of await shiphero.inboundShipments.completedSince(lastRun)) {
  await erp.completeTransfer(done.purchase_orders?.edges?.[0]?.node?.po_number);
}
```

Statuses run `PENDING_ARRIVAL` to `ARRIVED` to `RECEIVING` to `COMPLETED`, and
`completedSince` polls `status_updated_at`. Note that `inbound_shipment_update` requires
`warehouse_id` and `purchase_orders_ids` even when unchanged, and that the field is spelled
`purchase_order_ids` on create but `purchase_orders_ids` on update.

### Outbound transfers, and detecting a pick

```typescript
await shiphero.orders.create({
  order_number: 'ST-000123',
  partner_order_id: transferId,
  shop_name: 'erp',
  shipping_address: { first_name: 'Receiving', last_name: 'Dock', address1: '…', city: '…', state: '…', country: 'US', zip: '…' },
  line_items: [{ sku: 'BLUE-TEE-M', quantity: 5, price: '10.00' }]
});

for (const progress of await shiphero.orders.pickedSince(lastRun)) {
  if (progress.complete) await erp.markTransferInTransit(progress.orderNumber);
}
```

ShipHero has no "picked" order status and no filter for one. `pickedSince` reconstructs progress
from `tote_picks` on each line item, which is what a picker's scans write to, combined with
quantities already shipped. It returns orders where at least one unit has been picked, with
`complete` set once every unit is picked or shipped.

If a coarser signal is enough, `orders.readyToShipSince` uses ShipHero's own `ready_to_ship` flag
paired with `allocated_from`, the combination ShipHero recommends for polling.

### Adjustments back from the warehouse

```typescript
const writeOffs = await shiphero.inventory.adjustmentsSince(lastRun, {
  reasons: ['Damaged', 'Write-off'],
  warehouseId: warehouse!.id!,
  excludeCycleCounts: true
});

for (const change of writeOffs) {
  await erp.writeOff(change.sku, change.change_in_on_hand, change.reason, change.created_at);
}
```

ShipHero has no write-off document. Every movement — sales, receiving, cycle counts, manual
corrections — lands in `inventory_changes`, and a write-off is only distinguishable by the
free-text `reason` the operator chose. Agree on reason keywords with the warehouse team and pass
them as `reasons`; matching is a case-insensitive contains, and each keyword costs one pass because
ShipHero's filter takes a single value. Omitting `reasons` returns every change in the window.

ShipHero also caps a reason-filtered query at 60 days, so `adjustmentsSince` splits wider ranges
into 60 day windows and de-duplicates across passes.

## Errors

```typescript
import { ShipHeroError, ShipHeroAuthError, ShipHeroThrottleError } from '@first-light-dev/easify/shiphero';

try {
  await shiphero.orders.listAll({}, { max: 1000 });
} catch (error) {
  if (error instanceof ShipHeroThrottleError) {
    console.error(error.requiredCredits, error.remainingCredits, error.retryAfterMs);
  } else if (error instanceof ShipHeroAuthError) {
    console.error('re-authenticate', error.status);
  } else if (error instanceof ShipHeroError) {
    console.error(error.message, error.code, error.requestId, error.errors);
  }
}
```

ShipHero returns GraphQL errors with HTTP 200, so every error surfaces as one of these rather than
as an HTTP failure. `requestId` is worth logging: ShipHero support can trace it.

## Types

`src/shiphero/generated` is produced from ShipHero's schema reference and covers every type, input
and operation in the API: 413 objects, 162 inputs, 27 enums, 70 queries and 122 mutations.

```typescript
import type { Order, Product, CreatePurchaseOrderInput, OrdersQueryArgs } from '@first-light-dev/easify/shiphero';
```

Object fields are optional because a GraphQL response only carries what the selection set asked
for. Input fields keep the schema's nullability, so a required input field is required in
TypeScript. `SHIPHERO_QUERIES` and `SHIPHERO_MUTATIONS` describe each operation at runtime — its
argument types, payload field and whether it paginates — which is what the resource layer uses to
build documents.

Regenerate after a ShipHero release:

```bash
yarn codegen:shiphero            # uses the cache under .cache/shiphero-schema
yarn codegen:shiphero --refresh  # re-download the schema reference
yarn check:shiphero              # verify selection sets still match
```
