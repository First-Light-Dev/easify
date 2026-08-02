import type {
  CreateWebhookInput,
  DeleteWebhookInput,
  DisableWebhookInput,
  EnableWebhookInput,
  UpdateUrlWebhookInput
} from '../generated/inputs';
import type { Webhook } from '../generated/objects';
import type { WebhooksQueryArgs } from '../generated/operations';

import { BaseResource, ListAllOptions, MutateOptions, Page, PageOptions } from './base/Resource';
import { WEBHOOK } from './base/selections';

/**
 * Webhook subscriptions. Preferring webhooks over polling is the cheapest way to stay
 * current, since deliveries do not consume credits.
 *
 * ```ts
 * await shiphero.webhooks.create({ name: 'Shipment Update', url: 'https://example.com/hooks/shiphero' });
 * ```
 */
export default class Webhooks extends BaseResource {
  page(args: WebhooksQueryArgs = {}, options: PageOptions = {}): Promise<Page<Webhook>> {
    return this.fetchPage<Webhook>('webhooks', args, WEBHOOK, options);
  }

  listAll(args: WebhooksQueryArgs = {}, options: ListAllOptions = {}): Promise<Webhook[]> {
    return this.collect<Webhook>('webhooks', args, WEBHOOK, options);
  }

  create(data: CreateWebhookInput, options: MutateOptions = {}): Promise<Webhook> {
    return this.runMutation<Webhook>(
      'webhook_create',
      { data },
      options.selection ?? WEBHOOK,
      options
    );
  }

  updateUrl(data: UpdateUrlWebhookInput, options: MutateOptions = {}): Promise<Webhook> {
    return this.runMutation<Webhook>(
      'webhook_update_url',
      { data },
      options.selection ?? WEBHOOK,
      options
    );
  }

  enable(data: EnableWebhookInput, options: MutateOptions = {}): Promise<Webhook> {
    return this.runMutation<Webhook>(
      'webhook_enable',
      { data },
      options.selection ?? WEBHOOK,
      options
    );
  }

  disable(data: DisableWebhookInput, options: MutateOptions = {}): Promise<Webhook> {
    return this.runMutation<Webhook>(
      'webhook_disable',
      { data },
      options.selection ?? WEBHOOK,
      options
    );
  }

  delete(data: DeleteWebhookInput): Promise<unknown> {
    return this.runMutation('webhook_delete', { data }, '');
  }
}
