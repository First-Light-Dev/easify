import { AxiosInstance } from "axios";
import Cin7 from "..";
import { User } from "./types/Users";

/**
 * Cin7 users — read-only.
 *
 * The reason this exists: a sales order carries `salesPersonId` but its `salesPersonEmail` is
 * frequently null, so the id is the only link to a person. Resolving that id to a name means
 * looking it up here.
 *
 * Cin7 notes that a newly created user can take up to two hours to appear.
 */
export default class Users {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async get(id: string): Promise<User | undefined> {
        const response = await this.axios.get(`/Users/${id}`);
        return response.data;
    }

    /** Every user, active and inactive. Inactive ones still appear on historical orders. */
    async list(page: number = 1, rows: number = 250): Promise<User[]> {
        const response = await this.axios.get(`/Users`, { params: { page, rows } });
        return response.data as User[];
    }

    async getAll(): Promise<User[]> {
        const users: User[] = [];
        let page = 1;
        while (true) {
            const batch = await this.list(page, 250);
            users.push(...batch);
            if (batch.length < 250) break;
            page++;
        }
        return users;
    }

    async getByEmail(email: string): Promise<User | undefined> {
        const wanted = email.trim().toLowerCase();
        const users = await this.getAll();
        return users.find((user) => user.email?.trim().toLowerCase() === wanted);
    }
}
