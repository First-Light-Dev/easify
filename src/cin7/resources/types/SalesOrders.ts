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
    paymentTerms: string;
    branchId: number;
    
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

    // Fulfillment Relatef
    trackingCode: string;
    dispatchedDate: string; 
    logisticsCarrier: string;
    estimatedDeliveryDate: string;

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
}

export interface SalesOrderItem {
    code?: string;
    name?: string;
    productOptionId?: number;
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