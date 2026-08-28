export interface SalesOrder {
    id: number;
    reference: string;
    
    createdDate: string;
    modifiedDate: string;

    lineItems: Array<SalesOrderItem>;
    productTotal: number;


    // Important Fields
    costCenter: string;
    alternativeTaxRate: string;
    stage: string;
    memberId: number;
    memberEmail: string;

    /**
     * The Cin7 user credited with the sale.
     *
     * **`salesPersonEmail` is null in practice** — across 10,140 orders spanning three years on
     * a live account, not one carried an email. So the id is the only link to a person, and
     * resolving it needs either the Users endpoint or a supplied mapping.
     */
    salesPersonId: number;
    salesPersonEmail: string;
    paymentTerms: string;
    branchId: number;
    distributionBranchId: number;

    isVoid: boolean;
    
    // Address
    deliveryFirstName: string;
    deliveryLastName: string;
    deliveryCompany: string;
    deliveryAddress1: string;
    deliveryAddress2: string;
    deliveryCity: string;
    deliveryState: string;
    deliveryPostalCode: string;
    deliveryCountry: string;
    email: string;
    phone: string;
    customerOrderNo: string;

    firstName: string;
    lastName: string;

    billingFirstName: string;
    billingLastName: string;
    billingCompany: string;
    billingAddress1: string;
    billingAddress2: string;
    billingCity: string;
    billingState: string;
    billingPostalCode: string;
    billingCountry: string;

    // Fulfillment Relatef
    trackingCode: string;
    dispatchedDate: string; 
    logisticsCarrier: string;
    estimatedDeliveryDate: string;

    /**
     * Document state — **read-only**, and documented as `Draft`, `Approved`, `Void`.
     *
     * Not a fulfilment signal: an order sits at `Approved` from creation and never changes to
     * anything meaning "done". Use `stage` for workflow and `invoiceDate` for invoicing.
     */
    status: string;

    /**
     * Set, with `invoiceDate`, when the order is invoiced. Empty until then.
     *
     * Unique in practice — across 10,096 invoiced orders on a live account every one had a
     * number and no two shared it, which makes it a sounder external key than `reference`.
     */
    invoiceNumber: number;

    /** The sales channel, e.g. `Sale via AFC`, `WooCommerce Ocean Organics`. Often blank. */
    projectName: string;

    // Money Related
    invoiceDate: string;
    discountTotal: number;
    discountDescription: string;
    freightTotal: number;
    freightDescription: string;
    total: number;
    taxStatus: "Incl" | "Excl" | "Exempt";
    taxRate: number;

    customFields: Record<string, string | number>;


    internalComments: string;
    deliveryInstructions: string;

    logisticsStatus: number;

    /**
     * Accounting export state.
     *
     * `accountingImportStatus` is **nested here**, not a top-level field — reading
     * `order.accountingImportStatus` silently yields undefined rather than failing, so a tally
     * across 10,000 orders came back entirely blank before anyone noticed.
     */
    accountingAttributes: {
        importDate?: string;
        accountingImportStatus?: "DoNotImport" | "NotImported" | "Imported" | "Error";
    }
}

export interface SalesOrderItem {
    code?: string;
    name?: string;
    barcode?: string;
    lineComments?: string;
    qty: number;
    option1?: string;
    option2?: string;
    option3?: string;
    unitPrice: number;
    discount: number;
    qtyShipped?: number;
    actualQty?: number;
}