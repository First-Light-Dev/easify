import type {
  Account as AccountRecord,
  AuthenticatedUser,
  User,
  UserQuota,
  Warehouse
} from '../generated/objects';
import type { AccountQueryArgs, UserQueryArgs, UsersQueryArgs } from '../generated/operations';

import { BaseResource, GetOptions, ListAllOptions, Page, PageOptions } from './base/Resource';
import { ACCOUNT, AUTHENTICATED_USER, USER, USER_QUOTA, WAREHOUSE } from './base/selections';

/**
 * The authenticated user, the account it belongs to, and the credit quota.
 *
 * ```ts
 * const { credits_remaining } = await shiphero.account.quota();
 * const warehouse = await shiphero.account.warehouseByIdentifier('US 3PL Warehouse');
 * ```
 */
export default class Account extends BaseResource {
  /** The account behind the current token, including its warehouses. */
  get(args: AccountQueryArgs = {}, options: GetOptions = {}): Promise<AccountRecord | null> {
    return this.fetchObject<AccountRecord>('account', args, ACCOUNT, options);
  }

  /** The user the current token authenticates as. */
  me(options: GetOptions = {}): Promise<AuthenticatedUser | null> {
    return this.fetchObject<AuthenticatedUser>('me', {}, AUTHENTICATED_USER, options);
  }

  /**
   * Remaining credits, the account ceiling and the restore rate. Cheap enough to
   * poll before starting an expensive job.
   */
  async quota(): Promise<UserQuota> {
    return (await this.fetchObject<UserQuota>('user_quota', {}, USER_QUOTA)) ?? {};
  }

  /** Warehouses on the account. ShipHero exposes these through the account, not a query. */
  async warehouses(): Promise<Warehouse[]> {
    const account = await this.get({}, { selection: `id warehouses { ${WAREHOUSE} }` });
    return account?.warehouses ?? [];
  }

  /**
   * Finds a warehouse by its `identifier`, the name shown in the ShipHero UI and the
   * value integrations usually key on. Warehouse ids are opaque, so resolving them
   * from a stable name keeps configuration readable.
   */
  async warehouseByIdentifier(identifier: string): Promise<Warehouse | undefined> {
    const warehouses = await this.warehouses();
    return warehouses.find((warehouse) => warehouse.identifier === identifier);
  }

  user(args: UserQueryArgs = {}, options: GetOptions = {}): Promise<User | null> {
    return this.fetchObject<User>('user', args, USER, options);
  }

  users(args: UsersQueryArgs = {}, options: PageOptions = {}): Promise<Page<User>> {
    return this.fetchPage<User>('users', args, USER, options);
  }

  listUsers(args: UsersQueryArgs = {}, options: ListAllOptions = {}): Promise<User[]> {
    return this.collect<User>('users', args, USER, options);
  }
}
