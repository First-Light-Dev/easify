import { AxiosInstance } from 'axios';
import { ReadableResource, ResourceOptions } from './base/Resource';
import { User, UserSchema } from './types/Users';

/**
 * https://api.cin7.com/api/Help#Users
 *
 * Read-only. Cin7 notes that new users can take up to two hours to appear here.
 */
export default class Users extends ReadableResource<typeof UserSchema> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Users', UserSchema, options);
  }

  /** Fetches the first user with the given email address. */
  async getByEmail(email: string): Promise<User | undefined> {
    const users = await this.list();
    return users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  }
}
