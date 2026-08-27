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

    /**
     * The real price list: one entry per named price column configured in Cin7, keyed by the
     * column's own name — `retailIncNZD`, `wholesaleIncNZD`, `kingSeedsNZD`, `fSourceExclNZD`
     * and so on. Values are prices; an unset column is `0` or `null`.
     *
     * **Prefer this over the four flat fields above.** Those are positional slots carrying
     * generic labels that no longer describe their contents once a tenant arranges its own
     * price columns. Verified against a live catalogue of 493 SKUs, where every SKU showed:
     *
     * | Flat field | Actually holds |
     * |---|---|
     * | `retailPrice` | `retailIncNZD` |
     * | `wholesalePrice` | **`kingSeedsNZD`** — a reseller, not wholesale |
     * | `vipPrice` | **`wholesaleIncNZD`** — the real wholesale price |
     *
     * Reading `wholesalePrice` expecting a wholesale price therefore returns a specific
     * reseller's price, and nothing about the response says so.
     *
     * Note also that the column names encode their tax basis: `...IncNZD` includes GST,
     * `...ExclNZD` excludes it. Mixing the two produces a silent 15% error.
     *
     * The published spec models this as an array of strings; the API returns an object.
     */
    priceColumns: Record<string, number | null>;

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
