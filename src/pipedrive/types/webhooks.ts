/**
 * Webhook shapes. **v1 only** — Pipedrive has not moved webhook management to v2.
 *
 * The payload version and the API version are separate things: `version: '2.0'` selects the
 * v2 *payload shape* while the management endpoints themselves stay on `/v1/webhooks`.
 * v2 payloads have been the default since 17 March 2025 and are what this client requests.
 */

/** v2 payload envelope, as Pipedrive POSTs it to a subscription URL. */
export interface PipedriveWebhookPayload<T = Record<string, unknown>> {
  meta: {
    action: PipedriveWebhookAction;
    entity: PipedriveWebhookObject;
    /** Numeric id of the affected record, as a string. */
    entity_id?: string;
    company_id?: string;
    user_id?: string;
    correlation_id?: string;
    /** ISO-8601. */
    timestamp?: string;
    webhook_id?: string;
    version?: string;
    [key: string]: unknown;
  };
  /** The record after the change. Null on delete. */
  data: T | null;
  /**
   * The record before the change — the field that makes a "deal became won" trigger possible.
   *
   * Without comparing against `previous.status`, a `change` hook fires on **every** edit to a
   * won deal, so an order would be created again each time someone touched it.
   */
  previous?: T | null;
}

export type PipedriveWebhookAction = 'create' | 'change' | 'delete' | '*';

export type PipedriveWebhookObject =
  | 'activity'
  | 'deal'
  | 'lead'
  | 'note'
  | 'organization'
  | 'person'
  | 'pipeline'
  | 'product'
  | 'stage'
  | 'user'
  | '*';

export interface PipedriveWebhook {
  id: number;
  company_id?: number;
  owner_id?: number;
  user_id?: number;
  event_action?: PipedriveWebhookAction;
  event_object?: PipedriveWebhookObject;
  subscription_url?: string;
  version?: string;
  is_active?: number | boolean;
  add_time?: string;
  remove_time?: string | null;
  type?: string;
  http_auth_user?: string | null;
  last_delivery_time?: string | null;
  last_http_status?: number | null;
  remove_reason?: string | null;
  name?: string | null;
  [key: string]: unknown;
}

export interface PipedriveWebhookInput {
  /**
   * Must be HTTPS and publicly reachable.
   *
   * Pipedrive **deletes a subscription** after repeated delivery failures, so an endpoint
   * that is down long enough stops receiving events permanently rather than catching up.
   * Anything relying on webhooks needs a reconciling poll behind it.
   */
  subscription_url: string;
  event_action: PipedriveWebhookAction;
  event_object: PipedriveWebhookObject;
  name?: string;
  user_id?: number;
  /** Basic-auth credentials Pipedrive will present when calling the subscription URL. */
  http_auth_user?: string;
  http_auth_password?: string;
  /** Payload shape. Defaults to `2.0`, which is what this client's types describe. */
  version?: '1.0' | '2.0';
}
