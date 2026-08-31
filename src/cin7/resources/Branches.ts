import { AxiosInstance } from "axios";
import Cin7 from "..";
import { Branch } from "./types/Branches";

/**
 * Cin7 branches — read-only.
 *
 * A sales order carries `branchId`, a numeric id, while every human-supplied mapping names a
 * branch in words ("Paeroa"). This resource is what turns one into the other.
 *
 * Ids are **account-specific**, which is why callers are expected to configure branch *names*
 * and resolve them here rather than hardcoding numbers that mean nothing on another tenant —
 * the same reasoning applied to Pipedrive's hashed field codes.
 */
export default class Branches {
    constructor(private axios: AxiosInstance, private cin7: Cin7) { }

    async list(page: number = 1, rows: number = 250): Promise<Branch[]> {
        const response = await this.axios.get(`/Branches`, { params: { page, rows } });
        return response.data as Branch[];
    }

    async getAll(): Promise<Branch[]> {
        const branches: Branch[] = [];
        let page = 1;
        while (true) {
            const batch = await this.list(page, 250);
            branches.push(...batch);
            if (batch.length < 250) break;
            page++;
        }
        return branches;
    }

    /** The label a branch reads under, wherever Cin7 happens to put it. */
    static labelOf(branch: Branch): string {
        return (branch.company || branch.name || "").trim();
    }

    /** Case-insensitive lookup by branch label. `undefined` when no branch carries that name. */
    async findByName(name: string): Promise<Branch | undefined> {
        const wanted = name.trim().toLowerCase();
        const branches = await this.getAll();
        return branches.find((branch) => Branches.labelOf(branch).toLowerCase() === wanted);
    }
}
