import { z } from 'zod';

// Utility function to parse .NET JSON dates
function parseDotNetDate(dotNetDate: string | null): string | null {
    if (!dotNetDate) return null;
    
    // Match /Date(milliseconds)/ or \/Date(milliseconds)\/
    const match = dotNetDate.match(/\/Date\((\d+)\)\//);
    if (!match) return dotNetDate; // Return as-is if not .NET format
    
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp).toISOString();
}

// Zod Schemas with date transformations
export const CurrencySchema = z.object({
    CurrencyCode: z.string().max(3),
    Description: z.string().max(200),
    DefaultBuyRate: z.number(),
    DefaultSellRate: z.number(),
    Guid: z.string(),
    LastModifiedOn: z.string().transform(parseDotNetDate)
});

export const CustomerSchema = z.object({
    CurrencyId: z.number(),
    CustomerCode: z.string().max(500),
    CustomerName: z.string().max(500),
    Guid: z.string(),
    LastModifiedOn: z.string().transform(parseDotNetDate)
});

export const DeliveryContactSchema = z.object({
    EmailAddress: z.string().max(500),
    FirstName: z.string().max(500),
    Guid: z.string(),
    LastName: z.string().max(500),
    MobilePhone: z.string().max(500),
    OfficePhone: z.string().max(500),
    PhoneNumber: z.string().max(500)
});

export const SalespersonSchema = z.object({
    Email: z.string().max(500),
    FullName: z.string().max(500),
    Guid: z.string(),
    Obsolete: z.boolean(),
    LastModifiedOn: z.string().transform(parseDotNetDate)
});

export const TaxSchema = z.object({
    CanApplyToExpenses: z.boolean(),
    CanApplyToRevenue: z.boolean(),
    Description: z.string().max(50),
    Guid: z.string(),
    LastModifiedOn: z.string().transform(parseDotNetDate),
    Obsolete: z.boolean(),
    TaxCode: z.string().max(25),
    TaxRate: z.number()
});

export const WarehouseSchema = z.object({
    AddressLine1: z.string().max(500),
    AddressLine2: z.string().max(500),
    City: z.string().max(500),
    ContactName: z.string().max(50),
    Country: z.string().max(500),
    DDINumber: z.string().max(25),
    FaxNumber: z.string().max(25),
    Guid: z.string(),
    IsDefault: z.boolean(),
    LastModifiedOn: z.string().transform(parseDotNetDate),
    MobileNumber: z.string().max(25),
    Obsolete: z.boolean(),
    PostCode: z.string().max(500),
    PhoneNumber: z.string().max(25),
    Region: z.string().max(500),
    StreetNo: z.string().max(500),
    Suburb: z.string().max(500),
    WarehouseCode: z.string().max(15),
    WarehouseName: z.string().max(100)
});

export const AssemblySchema = z.object({
    Guid: z.string(),
    AssemblyNumber: z.string().max(15),
    AssemblyStatus: z.string().max(15)
});

export const ProductSchema = z.object({
    Guid: z.string(),
    ProductCode: z.string().max(100),
    ProductDescription: z.string().max(500)
});

export const SalesOrderLineSchema = z.object({
    Assembly: AssemblySchema,
    BCLineTax: z.number(),
    BCLineTotal: z.number(),
    BCUnitPrice: z.number(),
    Comments: z.string().max(1024),
    CostOfGoodsAccount: z.string().max(50),
    DiscountRate: z.number(),
    DueDate: z.string().transform(parseDotNetDate),
    Guid: z.string(),
    LastModifiedOn: z.string().nullable().transform(parseDotNetDate),
    LineNumber: z.number(),
    LineType: z.string(),
    LineTax: z.number(),
    LineTaxCode: z.string().max(50),
    LineTotal: z.number(),
    OrderQuantity: z.number(),
    Product: ProductSchema,
    TaxRate: z.number().nullable(),
    UnitCost: z.number().nullable(),
    UnitPrice: z.number(),
    Volume: z.number().nullable(),
    Weight: z.number().nullable(),
    XeroSalesAccount: z.string().max(500),
    XeroTaxCode: z.string().max(50)
});

// Main SalesOrder Schema
export const SalesOrderSchema = z.object({
    BCSubTotal: z.number().nullable(),
    BCTaxTotal: z.number().nullable(),
    BCTotal: z.number().nullable(),
    Comments: z.string().max(2048),
    CompletedDate: z.string().nullable().transform(parseDotNetDate),
    CreatedBy: z.string().max(50),
    CreatedOn: z.string().transform(parseDotNetDate),
    Currency: CurrencySchema,
    Customer: CustomerSchema,
    CustomerRef: z.string().max(500),
    CustomOrderStatus: z.string().max(15),
    DeliveryCity: z.string().max(500),
    DeliveryContact: DeliveryContactSchema,
    DeliveryCountry: z.string().max(500),
    DeliveryInstruction: z.string().max(500),
    DeliveryMethod: z.string().max(50),
    DeliveryName: z.string().max(500),
    DeliveryPostCode: z.string().max(50),
    DeliveryRegion: z.string().max(500),
    DeliveryStreetAddress: z.string().max(500),
    DeliveryStreetAddress2: z.string().max(500),
    DeliverySuburb: z.string().max(500),
    DiscountRate: z.number(),
    ExchangeRate: z.number().nullable(),
    Guid: z.string(),
    LastModifiedBy: z.string().max(50),
    LastModifiedOn: z.string().nullable().transform(parseDotNetDate),
    OrderDate: z.string().nullable().transform(parseDotNetDate),
    OrderNumber: z.string().max(20),
    OrderStatus: z.string().max(20),
    PaymentDueDate: z.string().nullable().transform(parseDotNetDate),
    ReceivedDate: z.string().nullable().transform(parseDotNetDate),
    RequiredDate: z.string().nullable().transform(parseDotNetDate),
    SalesOrderGroup: z.string().max(50),
    SalesAccount: z.string().max(50),
    SalesOrderLines: z.array(SalesOrderLineSchema),
    Salesperson: SalespersonSchema,
    SourceId: z.string().max(500),
    SubTotal: z.number(),
    Tax: TaxSchema,
    TaxRate: z.number().nullable(),
    TaxTotal: z.number(),
    Total: z.number(),
    TotalVolume: z.number().nullable(),
    TotalWeight: z.number().nullable(),
    Warehouse: WarehouseSchema,
    XeroTaxCode: z.string().max(50)
});

export const SalesOrderUpdateSchema = z.object({
    Comments: z.string().max(2048),
    CustomOrderStatus: z.string().max(15),
    CustomerRef: z.string().max(500),
    DeliveryCity: z.string().max(500),
    DeliveryCountry: z.string().max(500),
    DeliveryInstruction: z.string().max(500),
    DeliveryMethod: z.string().max(50),
    DeliveryName: z.string().max(500),
    DeliveryPostCode: z.string().max(50),
    DeliveryRegion: z.string().max(500),
    DeliveryStreetAddress: z.string().max(500),
    DeliveryStreetAddress2: z.string().max(500),
    DeliverySuburb: z.string().max(500),
    DiscountRate: z.number(),
    ExchangeRate: z.number(),
    OrderStatus: z.string().max(20),
    RequiredDate: z.iso.datetime(),
    SalesOrderGroup: z.string().max(50),
    Salesperson: z.object({
        Guid: z.string()
    }),
    SourceId: z.string().max(500),
    Tax: z.object({
        Guid: z.string()
    }),
    Warehouse: z.object({
        Guid: z.string()
    })
});

export const SalesOrderGetQuerySchema = z.object({
    completedAfter: z.string().optional(),
    completedBefore: z.string().optional(),
    customerCode: z.string().optional(),
    customerId: z.string().optional(),
    customOrderStatus: z.string().optional(),
    endDate: z.string().optional(),
    modifiedSince: z.string().optional(),
    orderNumber: z.string().optional(),
    orderStatus: z.string().optional(),
    pageSize: z.number().optional(),
    serialBatch: z.boolean().optional(),
    sourceId: z.string().optional(),
    startDate: z.string().optional(),
    warehouseCode: z.string().optional()
});

// Export types
export type Currency = z.infer<typeof CurrencySchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type DeliveryContact = z.infer<typeof DeliveryContactSchema>;
export type Salesperson = z.infer<typeof SalespersonSchema>;
export type Tax = z.infer<typeof TaxSchema>;
export type Warehouse = z.infer<typeof WarehouseSchema>;
export type Assembly = z.infer<typeof AssemblySchema>;
export type Product = z.infer<typeof ProductSchema>;
export type SalesOrderLine = z.infer<typeof SalesOrderLineSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;
export type SalesOrderUpdate = z.infer<typeof SalesOrderUpdateSchema>;
export type SalesOrderGetQuery = z.infer<typeof SalesOrderGetQuerySchema>;