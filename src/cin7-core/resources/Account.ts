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

export const WebhookSchema = z.looseObject({
  /** Unique ID. Required for PUT. */
  ID: z.string().nullable().optional(),
  /** See https://dearinventory.docs.apiary.io/#reference/webhooks for the value list. */
  Type: z.string().nullable().optional(),
  /** Friendly name. Read-only. */
  Name: z.string().nullable().optional(),
  IsActive: z.boolean().nullable().optional(),
  /** Callback URL Cin7 posts to. */
  ExternalURL: z.string().nullable().optional(),
  /** `noauth`, `basicauth` or `bearerauth`. */
  ExternalAuthorizationType: z.string().nullable().optional(),
  /** Required when `ExternalAuthorizationType` is `basicauth`. */
  ExternalUserName: z.string().nullable().optional(),
  /** Required when `ExternalAuthorizationType` is `basicauth`. */
  ExternalPassword: z.string().nullable().optional(),
  /** Required when `ExternalAuthorizationType` is `bearerauth`. */
  ExternalBearerToken: z.string().nullable().optional(),
  /** Additional request headers Cin7 will send. */
  ExternalHeaders: z
    .array(
      z.looseObject({
        Key: z.string().nullable().optional(),
        Value: z.string().nullable().optional()
      })
    )
    .nullable()
    .optional()
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
      // Verified live 2026-08-10: /webhooks returns "Webhooks", not the blueprint's name.
      'Webhooks',
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
