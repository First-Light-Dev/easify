/**
 * Webhook subscriptions. **v1 only** — Pipedrive has not moved webhook management to v2, so
 * every call here is routed to `/v1/webhooks` explicitly.
 *
 * Two operational facts worth knowing before relying on these:
 *
 * - **Pipedrive deletes a subscription after repeated delivery failures.** An endpoint that
 *   is down long enough stops receiving events permanently, and nothing announces it. Any
 *   webhook-driven flow needs a reconciling poll behind it, and `list()` is worth checking
 *   periodically to confirm the subscription is still there.
 * - **There is no replay.** Events missed while an endpoint was down are gone; the poll is
 *   the only way to recover them.
 */

import type { PipedriveHttpClient } from '../client/http-client';
import type {
  PipedriveWebhook,
  PipedriveWebhookAction,
  PipedriveWebhookInput,
  PipedriveWebhookObject,
} from '../types/webhooks';

export class PipedriveWebhooks {
  constructor(private readonly http: PipedriveHttpClient) {}

  /** Every subscription on the account. */
  async list(): Promise<PipedriveWebhook[]> {
    const data = await this.http.get<PipedriveWebhook[]>('webhooks', undefined, {
      version: 'v1',
      operation: 'listWebhooks',
    });
    return data ?? [];
  }

  /**
   * Creates a subscription.
   *
   * Defaults to payload version `2.0`, which is what `PipedriveWebhookPayload` describes and
   * has been Pipedrive's default since March 2025. Pinning it explicitly matters: a
   * subscription created as `1.0` delivers a different envelope, and the handler would read
   * `undefined` out of `meta`.
   */
  async create(input: PipedriveWebhookInput): Promise<PipedriveWebhook> {
    return this.http.post<PipedriveWebhook>(
      'webhooks',
      { version: '2.0', ...input },
      { version: 'v1', operation: 'createWebhook' }
    );
  }

  /** Deletes a subscription. */
  async delete(id: number | string): Promise<unknown> {
    return this.http.delete(`webhooks/${id}`, {
      version: 'v1',
      operation: 'deleteWebhook',
      recordId: id,
    });
  }

  /**
   * Creates the subscription only if an identical one is not already registered.
   *
   * Pipedrive happily registers duplicates, and each one delivers — so a service that
   * re-registers on every boot ends up processing each event as many times as it has
   * restarted. Matching is on the triple that defines delivery: url, action and object.
   */
  async ensure(input: PipedriveWebhookInput): Promise<{
    webhook: PipedriveWebhook;
    created: boolean;
  }> {
    const existing = (await this.list()).find(
      (hook) =>
        hook.subscription_url === input.subscription_url &&
        hook.event_action === input.event_action &&
        hook.event_object === input.event_object
    );

    if (existing) return { webhook: existing, created: false };
    return { webhook: await this.create(input), created: true };
  }

  /** Removes every subscription pointing at a URL. Useful when tearing down an environment. */
  async deleteByUrl(subscriptionUrl: string): Promise<number> {
    const matches = (await this.list()).filter(
      (hook) => hook.subscription_url === subscriptionUrl
    );
    for (const hook of matches) await this.delete(hook.id);
    return matches.length;
  }

  /** Narrowing helper for a handler switching on the event triple. */
  static matches(
    payloadMeta: { action?: string; entity?: string } | undefined,
    action: PipedriveWebhookAction,
    object: PipedriveWebhookObject
  ): boolean {
    if (!payloadMeta) return false;
    return payloadMeta.action === action && payloadMeta.entity === object;
  }
}
