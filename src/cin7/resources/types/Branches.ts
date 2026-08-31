/**
 * A Cin7 branch — the stock location an order ships from.
 *
 * Cin7's `/Branches` payload is contact-shaped, so the branch's display name is not in a field
 * called `name`. Agrisea's branches are named after people and places ("Paeroa", "Nick
 * Wilkins"), and that label appears in `company`. `name` is declared as well because the
 * endpoint is undocumented on this point and the two are used interchangeably elsewhere in the
 * API; `branchName` on a sales order carries the same label.
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
