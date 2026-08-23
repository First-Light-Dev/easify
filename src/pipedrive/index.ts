/**
 * Pipedrive CRM API — the vendor layer.
 *
 * This module owns everything specific to Pipedrive's wire format: the client, the record
 * shapes, the field-code translation and the error classification. Anything about what a
 * record *means* to a particular integration belongs in the application on top.
 *
 * Four things are easy to get wrong and are handled once, centrally:
 *
 * - **The surface spans two API versions.** v2 covers deals, persons, organizations, products
 *   and the `*Fields` endpoints; webhooks and notes remain on v1. The client routes per
 *   request, so resources declare their version and callers never think about it.
 * - **Custom fields are hashed keys**, unique per account. `fields.encode()` turns readable
 *   labels into the codes Pipedrive stores, so mappers never carry a hardcoded hash.
 * - **Every response is enveloped** as `{ success, data, additional_data }`, and a rejected
 *   write can arrive as a 200 with `success: false`. The client unwraps and checks both.
 * - **Paging is cursor-based**, and the end of a collection is a missing cursor, not an empty
 *   page.
 *
 * Authentication is an API token in the `x-api-token` header, or an OAuth bearer token. The
 * `api_token` query parameter is deliberately not used — it puts the credential in URLs, and
 * from there into logs.
 *
 * ```ts
 * const pipedrive = new Pipedrive({ credentials: { apiToken: process.env.PIPEDRIVE_TOKEN! } });
 *
 * const won = await pipedrive.deals.wonSince(lastRunAt);
 * for (const deal of won) {
 *   const lines = await pipedrive.deals.listProducts(deal.id);
 *   const extras = await pipedrive.fields.decode('deal', deal.custom_fields);
 *   // → { 'Farm ID': 'FARM-204', 'Delivery instructions': 'Leave at the north gate' }
 * }
 * ```
 */

import { PipedriveHttpClient } from './client/http-client';
import { PipedriveDeals } from './resources/deals';
import { PipedriveFields } from './resources/fields';
import { PipedriveOrganizations } from './resources/organizations';
import { PipedrivePersons } from './resources/persons';
import { PipedriveProducts } from './resources/products';
import { PipedriveWebhooks } from './resources/webhooks';
import type { PipedriveConnectorConfig, PipedriveQuota } from './types/config';

/** The API root. Overridable via `baseUrl` so a stand-in can be substituted in tests. */
export const PIPEDRIVE_BASE_URL = 'https://api.pipedrive.com';

/**
 * The root of the Pipedrive API.
 *
 * One HTTP client shared by every resource, so retry, throttling and quota tracking are
 * counted once rather than per resource.
 */
export class Pipedrive {
  readonly deals: PipedriveDeals;
  readonly persons: PipedrivePersons;
  readonly organizations: PipedriveOrganizations;
  readonly products: PipedriveProducts;
  readonly fields: PipedriveFields;
  readonly webhooks: PipedriveWebhooks;

  private readonly http: PipedriveHttpClient;

  constructor(config: PipedriveConnectorConfig) {
    this.http = new PipedriveHttpClient(config);
    this.deals = new PipedriveDeals(this.http);
    this.persons = new PipedrivePersons(this.http);
    this.organizations = new PipedriveOrganizations(this.http);
    this.products = new PipedriveProducts(this.http);
    this.fields = new PipedriveFields(this.http);
    this.webhooks = new PipedriveWebhooks(this.http);
  }

  /**
   * Remaining budget as of the last response, or null before any call.
   *
   * `dailyRequestsLeft` is the one to watch. The burst window refills every two seconds; the
   * daily token budget does not come back until the 24-hour reset.
   */
  rateLimitQuota(): PipedriveQuota | null {
    return this.http.getQuota();
  }

  /**
   * Whether these credentials can reach Pipedrive.
   *
   * Flattens every failure to `false`, losing the distinction between "wrong token" and
   * "Pipedrive is down" — call a resource directly when that difference matters.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.deals.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export default Pipedrive;

// ─── Client ───────────────────────────────────────────────────────────────────
export { PipedriveHttpClient } from './client/http-client';
export type { PipedriveApiVersion, PipedriveRequestOptions } from './client/http-client';

// ─── Resources ────────────────────────────────────────────────────────────────
export { PipedriveDeals } from './resources/deals';
export { PipedrivePersons } from './resources/persons';
export { PipedriveOrganizations } from './resources/organizations';
export { PipedriveProducts } from './resources/products';
export { PipedriveFields } from './resources/fields';
export { PipedriveWebhooks } from './resources/webhooks';
export { PipedriveResource } from './resources/base';
export type { PipedrivePage } from './resources/base';

// ─── Types ────────────────────────────────────────────────────────────────────
export { MAX_PAGE_LIMIT, toPipedriveTime, primaryValue } from './types/common';
export type {
  PipedriveEnvelope,
  PipedriveAdditionalData,
  PipedriveListOptions,
  PipedriveSyncOptions,
  PipedriveAddress,
  PipedriveContactPoint,
  PipedriveCustomFields,
} from './types/common';
export type {
  PipedriveConnectorConfig,
  PipedriveCredentials,
  PipedriveApiTokenCredentials,
  PipedriveOAuthCredentials,
  PipedriveQuota,
  Gate,
  Logger,
} from './types/config';
export type {
  PipedriveDeal,
  PipedriveDealInput,
  PipedriveDealStatus,
  PipedriveDealListOptions,
  PipedriveDealProduct,
  PipedriveDealProductInput,
} from './types/deals';
export type {
  PipedrivePerson,
  PipedrivePersonInput,
  PipedrivePersonListOptions,
} from './types/persons';
export type {
  PipedriveOrganization,
  PipedriveOrganizationInput,
  PipedriveOrganizationListOptions,
} from './types/organizations';
export type {
  PipedriveProduct,
  PipedriveProductInput,
  PipedriveProductPrice,
  PipedriveProductListOptions,
} from './types/products';
export type {
  PipedriveField,
  PipedriveFieldEntity,
  PipedriveFieldOption,
  PipedriveFieldType,
} from './types/fields';
export type {
  PipedriveWebhook,
  PipedriveWebhookInput,
  PipedriveWebhookPayload,
  PipedriveWebhookAction,
  PipedriveWebhookObject,
} from './types/webhooks';

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  PipedriveApiError,
  PipedriveAuthError,
  PipedriveForbiddenError,
  PipedriveCredentialsError,
  PipedriveNotFoundError,
  PipedriveClientError,
  PipedriveRateLimitError,
  PipedriveServerError,
  PipedriveNetworkError,
  PipedriveResponseError,
  translatePipedriveError,
  describePipedriveBody,
  looksLikePipedriveFailure,
  readQuota,
  guard,
} from './errors/index';
export type { PipedriveApiErrorInput, PipedriveErrorContext } from './errors/index';
