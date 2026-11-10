# ShipHero

A TypeScript client for the [ShipHero public GraphQL API](https://developer.shiphero.com/).

This module is a **transport, not a query library**. It owns authentication, token refresh,
credit-based throttling and retries, and it executes whatever document you give it. The queries
themselves live in the connector project, generated straight off ShipHero's live schema, so adding
an operation never requires a release here.

It follows the same shape as the Shopify client in this repo: a thin `query`/`mutate` pair whose
types come from codegen rather than from hand-written resource classes.

## Quick start

```typescript
import { ShipHero } from '@first-light-dev/easify/shiphero';

const shiphero = new ShipHero({
  auth: { accessToken: '...', refreshToken: '...' },
  options: { customerAccountId: 'QWNjb3VudDoxMjM0' }
});

const data = await shiphero.query<{ user_quota: { credits_remaining: number } }>(
  'query { user_quota { credits_remaining max_available increment_rate } }'
);
```

That works, but you lose type safety on the result. Set up codegen and you get it back for free.

## Codegen

Despite the docs not advertising it, ShipHero's endpoint supports standard GraphQL introspection
once you're authenticated — the [Getting Started](https://developer.shiphero.com/getting-started/)
and [GraphQL Primer](https://developer.shiphero.com/graphql-primer/) pages both point third-party
tooling (sgqlc, Altair, GraphQL Playground) at `https://public-api.shiphero.com/graphql` with a
bearer token to fetch the schema. graphql-codegen can do the same thing directly, the same way
this repo points codegen at Shopify's schema for the `shopify` module — no separate SDL file to
ship or keep in sync.

```typescript
// codegen.ts, in the connector project
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: [
    {
      'https://public-api.shiphero.com/graphql': {
        headers: { Authorization: `Bearer ${process.env.SHIPHERO_ACCESS_TOKEN}` }
      }
    }
  ],
  documents: ['src/**/*.graphql'],
  generates: {
    './src/generated/shiphero.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node']
    }
  }
};

export default config;
```

The token just needs to be valid, not privileged for anything in particular — any access token
from the connector's own credentials works, and codegen only ever reads the schema with it. Run
codegen with that token available (locally or as a CI secret) and rerun it whenever ShipHero ships
a schema change you need.

If you want a local `.graphql` copy of the schema to diff against or browse offline, add the
`schema-ast` plugin as a second output — this is optional, and nothing in this package depends
on it:

```typescript
generates: {
  './src/generated/shiphero.ts': {
    plugins: ['typescript', 'typescript-operations', 'typed-document-node']
  },
  './schema.graphql': { plugins: ['schema-ast'] }
}
```

Write a document:

```graphql
# src/purchase-orders.graphql
query PurchaseOrdersUpdatedSince($from: DateTime, $after: String) {
  purchase_orders(updated_from: $from) {
    request_id
    complexity
    data(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          po_number
          fulfillment_status
          line_items(first: 100) {
            edges { node { sku quantity quantity_received } }
          }
        }
      }
    }
  }
}
```

Then run it. Result and variable types are inferred from the generated document, so nothing at the
call site needs annotating, and a typo in a variable name is a compile error:

```typescript
import { PurchaseOrdersUpdatedSinceDocument } from './generated/shiphero';

const data = await shiphero.query(PurchaseOrdersUpdatedSinceDocument, {
  from: lastRun.toISOString(),
  after: cursor
});

for (const edge of data.purchase_orders.data.edges) {
  console.log(edge.node.po_number);
}
```

Raw strings still work when you want a throwaway query; supply the result type yourself.

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
estimate is driven by Relay page sizes, and **nested connections multiply it** — a 100-row query
with 100-row line items is estimated at 10001 credits and rejected outright, before it runs.
Unused rows are credited back, so asking for 50 and receiving 30 costs 30.

Because the documents now live in your project, sizing those pages is your responsibility. Always
put an explicit `first` on every connection, including nested ones, and keep the product of the
outer and inner page sizes well under the ceiling.

The client handles what it can:

- Credit exhaustion (error code 30) is retried after the delay ShipHero reports. An operation that
  structurally costs more than the account ceiling is not retried, since waiting cannot help it;
  it throws `ShipHeroThrottleError`.
- Separately from credits, ShipHero returns 429 above 7000 requests per rolling five minutes,
  counting failures and introspection. The client paces itself at 6500 by default, leaving
  headroom for other clients on the same account.
- Every response's `request_id` and `complexity` are recorded on `shiphero.lastCost`, which is the
  cheapest way to find out what a query actually cost.

Select `request_id` and `complexity` in your documents to populate `lastCost`, and check remaining
credits with `user_quota` before widening a query. For full-catalogue reconciliation prefer an
inventory snapshot over paging, and prefer webhooks over polling — neither costs credits per row.

## Pagination

ShipHero uses Relay connections. Ask for `pageInfo` and loop on the cursor:

```typescript
let after: string | undefined;
const orders = [];

do {
  const data = await shiphero.query(OrdersDocument, { from, after });
  const page = data.orders.data;
  orders.push(...page.edges.map((edge) => edge.node));
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
} while (after);
```

Nested connections paginate independently and have their own `pageInfo`. If a purchase order has
more line items than the inner `first`, fetch the rest with a separate document keyed on the order
id rather than raising the inner page size, which multiplies the credit cost of every row.

## Errors

| Class | Raised when |
| --- | --- |
| `ShipHeroError` | any non-2xx response, or a GraphQL `errors` array |
| `ShipHeroAuthError` | no usable credentials, a failed token request, or a rejected token |
| `ShipHeroThrottleError` | credits exhausted beyond what a retry can recover |

`ShipHeroThrottleError` carries `requiredCredits`, `remainingCredits` and `retryAfterMs` so a job
runner can reschedule rather than fail.

## The schema

This package ships no schema and no generated TypeScript types of its own — both come from the
codegen you run in your project, against ShipHero's live, authenticated endpoint. That's strictly
better than anything shipped here could be: it's the server's actual schema rather than a copy,
and the generated types describe the selection sets you actually use rather than every field of
every type in the schema.

One consequence worth knowing: codegen needs a real ShipHero access token to run, since the
endpoint requires authentication even for introspection. That's rarely a problem in practice — a
connector already has one — but it does mean codegen can't run fully offline or without
credentials, unlike a schema shipped as a static file.
