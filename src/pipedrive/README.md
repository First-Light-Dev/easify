# Pipedrive

Typed client for the Pipedrive CRM API — deals, persons, organizations, products, custom
fields and webhooks.

```ts
import { Pipedrive } from '@first-light-dev/easify/pipedrive';

const pipedrive = new Pipedrive({
  credentials: { apiToken: process.env.PIPEDRIVE_API_TOKEN! },
});
```

OAuth works the same way: `credentials: { accessToken }`. This client does not refresh OAuth
tokens — the host owns the refresh cycle.

## What it handles for you

**Two API versions.** Pipedrive's surface is split: v2 covers deals, persons, organizations,
products and every `*Fields` endpoint, while webhooks and notes remain on v1. Resources
declare their own version, so callers never think about it. Sending a v2 call to v1 returns a
404 that reads like a missing record.

**Hashed custom field keys.** Pipedrive stores custom values under a 40-character hex code
that differs per account, so a hardcoded hash cannot run against both sandbox and production
— and a wrong one fails silently, because Pipedrive rejects the unknown key and the value is
simply never written. Address fields by label instead:

```ts
await pipedrive.deals.update(dealId, {
  custom_fields: await pipedrive.fields.encode('deal', {
    'Farm ID': 'FARM-204',
    'Delivery instructions': 'Leave at the north gate',
  }),
});

await pipedrive.fields.decode('deal', deal.custom_fields);
// → { 'Farm ID': 'FARM-204', 'Delivery instructions': 'Leave at the north gate' }
```

The schema is cached for 10 minutes; call `fields.refresh()` after adding a field in the UI.
An ambiguous label throws rather than picking one, because Pipedrive allows two fields to
share a label and choosing arbitrarily writes data into whichever sorted first.

**Cursor paging.** `pages()` yields one page at a time, `listAll()` collects everything, and
both stop on a missing `next_cursor` rather than an empty page. Defaults to the 500-row
maximum, because a list read costs ~20 tokens regardless of page size.

**Envelope unwrapping.** Every response arrives as `{ success, data, additional_data }` and a
rejected write can come back as a 200 with `success: false`. Both are handled centrally, so a
failed write never registers as a successful sync.

**Error classification.** Every failure is a `PipedriveApiError` subclass carrying
`retryable` — the same contract the Finale and ShipStation connectors expose, so a host has
one retry rule across vendors.

## Incremental sync

```ts
const changed = await pipedrive.persons.updatedSince(lastRunAt);
const won = await pipedrive.deals.wonSince(lastRunAt);
```

`updatedSince` sorts ascending by `update_time` so you can checkpoint and resume. The bound is
**inclusive** — the checkpoint record returns on the next run, so downstream writes must be
idempotent.

`wonSince` is not the same as `list({ status: 'won', updated_since })`. Pipedrive cannot filter
on `won_time`, so that query also returns a deal won last year whose title changed this
morning — and an order integration would create a second sales order for it. `wonSince` pulls
the `update_time` superset and narrows on `won_time`.

Timestamps must be `YYYY-MM-DD HH:MM:SS` in UTC, not ISO-8601. Pipedrive answers 200 and
**silently ignores** a malformed value, so a poller returns the whole collection every tick
and looks like it is working. `toPipedriveTime` converts, and the resources call it for you.

## Rate limits

Pipedrive meters two things at once, and `rateLimitQuota()` reports both:

| Meter | Header | Behaviour |
|---|---|---|
| Burst window | `x-ratelimit-*` | Rolling 2 seconds, sized by plan (Lite 20 → Ultimate 120). Refills immediately |
| Daily token budget | `x-daily-requests-left` | Resets every 24 hours. Ends the sync for the day |

Requests are priced in tokens, not counted: roughly 2 for a single read, 20 for a list, 10 for
an update, and **40 for a search**. A per-record search loop drains the budget about twenty
times faster than the same number of reads — prefer filtered list reads, or store an external
id in a custom field, over `/search` in a hot path.

Both arrive as 429. `PipedriveRateLimitError.dailyExhausted` separates them, and the client
does not retry an exhausted daily budget in-process — the reset can be hours away, so it fails
and lets a durable queue retry later. Supply a `gate` for pollers to stay inside the burst
window.

## Webhooks

Management is v1-only. Payloads default to version `2.0`.

```ts
await pipedrive.webhooks.ensure({
  subscription_url: 'https://example.com/hooks/pipedrive',
  event_action: 'change',
  event_object: 'deal',
});
```

`ensure` is the safe form — Pipedrive registers duplicates happily, and each one delivers, so
a service that re-registers on boot processes every event once per restart.

Two operational facts: **Pipedrive deletes a subscription after repeated delivery failures**,
silently, and **there is no replay**. Anything webhook-driven needs a reconciling poll behind
it. The v2 payload includes `previous`, which is what makes a "deal *became* won" trigger
possible — without comparing against `previous.status`, a `change` hook fires on every edit to
an already-won deal.
