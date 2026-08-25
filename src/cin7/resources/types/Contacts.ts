export interface ContactSecondaryContact {
    id?: number;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    isDefault?: boolean;
}

export interface Contact {
    id: number;
    createdDate: string;
    modifiedDate: string;
    isActive: boolean;

    /**
     * Contact type. Documented values: Customer, Supplier, Internal.
     * A customer sync should filter on this — the endpoint returns suppliers too.
     */
    type: string;

    company: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    email: string;
    website: string;
    phone: string;
    fax: string;
    mobile: string;

    /** Physical / delivery address. */
    address1: string;
    address2: string;
    city: string;
    state: string;
    postCode: string;
    country: string;

    /** Postal address. Cin7's second address block, used for billing in most setups. */
    postalAddress1: string;
    postalAddress2: string;
    postalCity: string;
    postalPostCode: string;
    postalState: string;
    postalCountry: string;

    accountNumber: string;
    salesPersonId: number;
    billingId: number;
    billingCompany: string;
    billingEmail: string;
    accountsFirstName: string;
    accountsLastName: string;
    accountsPhone: string;
    billingCostCenter: string;
    costCenter: string;

    /**
     * Which product price tier this customer is charged on — it selects among the
     * per-SKU tiers on a ProductOption. Relevant to any catalogue price sync.
     */
    priceColumn: string;
    percentageOff: number;
    paymentTerms: string;
    taxStatus: string;
    taxNumber: string;
    creditLimit: number;
    balanceOwing: number;
    onHold: boolean;

    group: string;
    subGroup: string;
    stages: string;
    notes: string;

    /**
     * Free-text reference for the id this contact carries in an external system.
     * The natural place to store a counterpart id rather than adding a custom field.
     */
    integrationRef: string;

    /**
     * Custom fields. The API returns an object keyed by field name, though the spec also
     * permits an array — hence the union.
     */
    customFields: Record<string, string | number> | unknown[];

    secondaryContacts: ContactSecondaryContact[];
}
