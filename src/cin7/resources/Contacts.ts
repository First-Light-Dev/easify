import { AxiosInstance } from "axios";
import { APIUpsertResponse } from "./types";
import Cin7 from "..";
import { Contact } from "./types/Contacts";

/**
 * Quotes a value for use inside a `where` clause.
 *
 * Cin7 escapes a literal apostrophe by doubling it. Without this an ordinary customer name
 * like "O'Brien Farms" terminates the string early and the query fails or, worse, matches
 * something unintended.
 */
function whereValue(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export default class Contacts {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async get(id: string): Promise<Contact | undefined> {
        const response = await this.axios.get(`/Contacts/${id}`);
        return response.data;
    }

    async getByIds(ids: string[]): Promise<Contact[]> {
        const response = await this.axios.get(`/Contacts?where=${ids.map(id => `Id=${id}`).join(' OR ')}`);
        return response.data as Contact[];
    }

    /**
     * The contact carrying an email address, or undefined.
     *
     * The result is re-checked locally rather than trusting the first row: the `where` clause
     * is matched by Cin7, but taking `[0]` blindly would attach an order to the wrong customer
     * if the filter ever behaves loosely. Email is not unique in Cin7, so use `getAllByEmail`
     * where a duplicate must be detected rather than hidden.
     */
    async getByEmail(email: string): Promise<Contact | undefined> {
        const wanted = email.trim().toLowerCase();
        const contacts = await this.getAllByEmail(wanted);
        return contacts[0];
    }

    /** Every contact carrying an email address — for duplicate detection. */
    async getAllByEmail(email: string): Promise<Contact[]> {
        const wanted = email.trim().toLowerCase();
        if (!wanted) return [];

        const response = await this.axios.get(`/Contacts`, {
            params: { where: `email=${whereValue(wanted)}` }
        });

        return (response.data as Contact[]).filter(contact => contact.email?.trim().toLowerCase() === wanted);
    }

    async getByEmails(emails: string[]): Promise<Contact[]> {
        const response = await this.axios.get(`/Contacts`, {
            params: { where: emails.map(email => `email=${whereValue(email.trim().toLowerCase())}`).join(' OR ') }
        });
        return response.data as Contact[];
    }

    async getByCompany(company: string): Promise<Contact[]> {
        const response = await this.axios.get(`/Contacts`, {
            params: { where: `company=${whereValue(company)}` }
        });
        return response.data as Contact[];
    }

    /**
     * The contact whose `integrationRef` holds an external id.
     *
     * This is the cheap path once a customer has been matched once: the id is stored on both
     * sides, so later syncs resolve directly instead of searching by email.
     */
    async getByIntegrationRef(ref: string): Promise<Contact | undefined> {
        const response = await this.axios.get(`/Contacts`, {
            params: { where: `integrationRef=${whereValue(ref)}` }
        });
        const contacts = response.data as Contact[];
        return contacts.find(contact => contact.integrationRef === ref);
    }

    async create(contact: Partial<Contact>): Promise<string> {
        console.log("Creating Contact", JSON.stringify(contact));
        const response = await this.axios.post(`/Contacts`, [contact]);

        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async createBatch(contacts: Partial<Contact>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.post(`/Contacts`, contacts);
        console.log("Contacts Create Batch Response", JSON.stringify(response.data));
        return response.data as Array<APIUpsertResponse>;
    }

    async update(contact: Partial<Contact>): Promise<string> {
        console.log("Updating Contact", JSON.stringify(contact));
        const response = await this.axios.put(`/Contacts`, [contact]);
        const data = response.data as Array<APIUpsertResponse>;
        const success = data.every(r => r.success);
        if (!success) {
            throw new Error(data[0].errors.join(', '));
        }
        return data[0].id.toString();
    }

    async updateBatch(contacts: Partial<Contact>[]): Promise<Array<APIUpsertResponse>> {
        const response = await this.axios.put(`/Contacts`, contacts);
        return response.data as Array<APIUpsertResponse>;
    }

    async query(where: string, page: number = 1, rows: number = 100, order?: {field: string, direction : "ASC" | "DESC"}): Promise<Contact[]> {
        const response = await this.axios.get(`/Contacts`, {
            params: {
                where,
                page,
                rows,
                ...(order ? { order: `${order.field} ${order.direction}` } : {})
            }
        });
        return response.data as Contact[];
    }

    async getRecentlyModified(timeWindow: number = 18 * 60 * 1000): Promise<Contact[]> {
        const now = new Date();

        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString();

        const contacts = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/Contacts`, {
                params: {
                    where: `modifiedDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            contacts.push(...response.data);
            if(response.data.length === 0) break;
            page++;
        }
        return contacts;
    }

    async getRecentlyCreated(timeWindow: number = 18 * 60 * 1000): Promise<Contact[]> {
        const now = new Date();

        const timeWindowAgo = new Date(now.getTime() - timeWindow).toISOString();

        const contacts = [];

        let page = 1;
        while(true) {
            console.log(`Getting page ${page}`);
            const response = await this.axios.get(`/Contacts`, {
                params: {
                    where: `createdDate >= '${timeWindowAgo}'`,
                    page
                }
            });
            contacts.push(...response.data);
            if(response.data.length === 0) break;
            page++;
        }
        return contacts;
    }

    /**
     * Every contact modified at or after an explicit timestamp.
     *
     * `getRecentlyModified` takes a rolling window, which does not fit a poller resuming from
     * a stored cursor — the gap between runs is not the same as the window. This takes the
     * cursor directly. The bound is inclusive, so the checkpoint record is returned again on
     * the next run and writes driven by it must be idempotent.
     */
    async getModifiedSince(since: Date | string, rows: number = 250): Promise<Contact[]> {
        const timestamp = typeof since === "string" ? since : since.toISOString();

        const contacts: Contact[] = [];

        let page = 1;
        while(true) {
            const response = await this.axios.get(`/Contacts`, {
                params: {
                    where: `modifiedDate >= '${timestamp}'`,
                    order: "modifiedDate ASC",
                    page,
                    rows
                }
            });
            const batch = response.data as Contact[];
            contacts.push(...batch);
            if(batch.length < rows) break;
            page++;
        }
        return contacts;
    }
}
