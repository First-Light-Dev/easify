export interface ProductImage {
    link?: string;
}

/**
 * A sellable variant of a product. **This is where the SKU lives** — `code` is the SKU,
 * not the parent product's `styleCode` — and where every price sits.
 */
export interface ProductProductOption {
    id: number;
    createdDate: string;
    modifiedDate: string;
    status: string;
    productId: number;

    /** The SKU. */
    code: string;
    barcode: string;
    productOptionCode: string;
    productOptionSizeCode: string;
    productOptionBarcode: string;
    productOptionSizeBarcode: string;
    supplierCode: string;

    option1: string;
    option2: string;
    option3: string;
    optionWeight: number;
    size: string;
    sizeId: number;

    /**
     * Cin7 holds several named price tiers per SKU, not one price. A customer is charged
     * on the tier named by their `Contact.priceColumn`.
     */
    retailPrice: number;
    wholesalePrice: number;
    vipPrice: number;
    specialPrice: number;
    specialsStartDate: string;
    specialDays: number;

    /** Additional named price tiers beyond the four above, positional. */
    priceColumns: string[];

    stockAvailable: number;
    stockOnHand: number;
    image: ProductImage;
}

export interface Product {
    id: number;
    status: string;
    createdDate: string;
    modifiedDate: string;

    /** The parent product code. Sellable SKUs are `productOptions[].code`. */
    styleCode: string;
    name: string;
    description: string;
    tags: string;
    images: ProductImage[];
    pdfUpload: string;
    pdfDescription: string;

    supplierId: number;
    brand: string;
    category: string;
    subCategory: string;
    categoryIdArray: number[];
    channels: string;

    weight: number;
    height: number;
    width: number;
    length: number;
    volume: number;

    stockControl: string;
    orderType: string;
    productType: string;
    productSubtype: string;
    projectName: string;

    optionLabel1: string;
    optionLabel2: string;
    optionLabel3: string;

    salesAccount: string;
    purchasesAccount: string;
    importCustomsDuty: string;
    sizeRangeId: number;

    customFields: Record<string, string | number> | unknown[];

    /** The sellable SKUs beneath this product, each with its own code and prices. */
    productOptions: ProductProductOption[];
}
