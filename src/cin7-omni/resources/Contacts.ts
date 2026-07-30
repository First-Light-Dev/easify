import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource, whereValue } from './base/Resource';
import { DeleteResult } from './types/Common';
import { Contact, ContactCreateSchema, ContactSchema, ContactUpdateSchema } from './types/Contacts';

/** https://api.cin7.com/api/Help#Contacts */
export default class Contacts extends WritableResource<
  typeof ContactSchema,
  typeof ContactCreateSchema,
  typeof ContactUpdateSchema
> {
  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    super(axios, '/v1/Contacts', ContactSchema, ContactCreateSchema, ContactUpdateSchema, options);
  }

  /** Fetches the first contact with the given email address. */
  async getByEmail(email: string): Promise<Contact | undefined> {
    const [contact] = await this.list({ where: `email=${whereValue(email)}`, rows: 1 });
    return contact;
  }

  /** Fetches every contact belonging to the given company. */
  async getByCompany(company: string, options: QueryOptions = {}): Promise<Contact[]> {
    return this.listAll({ ...options, where: `company=${whereValue(company)}` });
  }

  /** Deletes a contact. */
  async delete(id: number | string): Promise<DeleteResult> {
    return this.deleteRecord(id);
  }
}
