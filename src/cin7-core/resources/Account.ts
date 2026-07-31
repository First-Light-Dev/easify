import { AxiosInstance } from 'axios';
import { z } from 'zod';
import {
  QueryOptions,
  ReadableResource,
  ResourceOptions,
  WritableResource
} from './base/Resource';
import {
  ME,
  MESchema,
  MeAddress,
  MeAddressSchema,
  MeContact,
  MeContactSchema,
  Transactions,
  TransactionsSchema
} from './types/Account';

const WebhookSchema = z.looseObject({
  ID: z.string().nullable().optional(),
  Type: z.string().nullable().optional(),
  IsActive: z.boolean().nullable().optional(),
  ExternalURL: z.string().nullable().optional(),
  ExternalAuthorizationType: z.string().nullable().optional(),
  ExternalUserName: z.string().nullable().optional(),
  ExternalPassword: z.string().nullable().optional()
});

type Webhook = z.infer<typeof WebhookSchema>;

/** Account, addresses, contacts, webhooks and transactions. */
export default class Account {
  readonly me: ReadableResource<typeof MESchema>;
  readonly addresses: WritableResource<typeof MeAddressSchema>;
  readonly contacts: WritableResource<typeof MeContactSchema>;
  readonly webhooks: WritableResource<typeof WebhookSchema>;
  readonly transactions: ReadableResource<typeof TransactionsSchema>;

  constructor(
    private readonly axios: AxiosInstance,
    options: ResourceOptions = {}
  ) {
    this.me = new ReadableResource(axios, '/me', MESchema, 'Me', options);
    this.addresses = new WritableResource(
      axios,
      '/me/addresses',
      MeAddressSchema,
      'MeAddressesList',
      options
    );
    this.contacts = new WritableResource(
      axios,
      '/me/contacts',
      MeContactSchema,
      'MeContactsList',
      options
    );
    this.webhooks = new WritableResource(
      axios,
      '/webhooks',
      WebhookSchema,
      'WebhookList',
      options
    );
    this.transactions = new ReadableResource(
      axios,
      '/transactions',
      TransactionsSchema,
      'Transactions',
      options
    );
  }

  /** Fetches the current account profile (`GET /me`). */
  async getProfile(): Promise<ME> {
    const response = await this.axios.get('/me');
    return MESchema.parse(response.data);
  }

  listTransactions(params: QueryOptions = {}) {
    return this.transactions.list(params);
  }
}

export type { ME, MeAddress, MeContact, Transactions, Webhook };
