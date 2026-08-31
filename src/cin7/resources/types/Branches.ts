/**
 * A Cin7 branch — the stock location an order ships from.
 *
 * Cin7's `/Branches` payload is contact-shaped, so the branch's display name is **not** in a
 * field called `name`. Verified against a live tenant (36 branches, 2026-08-31): the label sits
 * in `company` and `name` is absent from the payload entirely. `name` is still declared, and
 * read as a fallback, purely so a tenant that does return it is not mis-read — it costs one
 * `||` and removes a silent failure mode.
 */
export interface Branch {
    id: number;
    /** The branch label as it reads in the Cin7 UI. */
    company?: string;
    name?: string;
    isActive?: boolean;
    address1?: string;
    city?: string;
    country?: string;
}
