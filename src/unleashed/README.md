# Unleashed API Documentation

A TypeScript client for the [Unleashed Software API](https://apidocs.unleashedsoftware.com/) with built-in authentication, request signing, and type safety.

## Installation

```bash
npm install @first-light-dev/easify
# or
yarn add @first-light-dev/easify
```

## Quick Start

```typescript
import { Unleashed } from '@first-light-dev/easify/unleashed';

const unleashed = new Unleashed({
  auth: {
    api: {
      id: 'your-api-id',
      key: 'your-api-key'
    },
    clientType: 'YourAppName'
  }
});

// Query sales orders
const orders = await unleashed.salesOrders.query({
  pageSize: 100,
  orderStatus: 'Parked'
});

console.log(orders.Items);
```

## Configuration

### UnleashedConfig

The `Unleashed` client requires a configuration object:

```typescript
interface UnleashedConfig {
  auth: {
    api: {
      id: string;      // Your Unleashed API ID
      key: string;     // Your Unleashed API Key
    };
    clientType: string; // Your application identifier
  };
}
```

**Example:**

```typescript
const config = {
  auth: {
    api: {
      id: process.env.UNLEASHED_API_ID!,
      key: process.env.UNLEASHED_API_KEY!
    },
    clientType: 'Firstlight/OrderSync'
  }
};

const unleashed = new Unleashed(config);
```

## Features

### 🔐 Automatic Request Signing

All API requests are automatically signed using HMAC-SHA256 with your API key. The signature is computed from the query parameters and added to request headers.

### 🔄 Built-in Retry Logic

The client automatically retries requests that fail with a 429 (Too Many Requests) status code, using exponential backoff with jitter:
- Maximum of 3 retry attempts
- Exponential delay: 1s, 2s, 4s (capped at 8s)
- Random jitter of ±0.5s to prevent thundering herd

### ✅ Type Safety

All data structures are validated using [Zod](https://github.com/colinhacks/zod) schemas, ensuring type safety and runtime validation.

### 📅 Automatic Date Parsing

.NET JSON dates (e.g., `/Date(1609459200000)/`) are automatically converted to ISO 8601 format.

## Resources

### Sales Orders

The `salesOrders` resource provides methods to interact with Unleashed sales orders.

#### Query Sales Orders

Retrieve a list of sales orders with optional filters.

```typescript
async query(query?: SalesOrderGetQuery): Promise<UnleashedQueryResponse<SalesOrder>>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `completedAfter` | `string` | Filter orders completed after this date (ISO 8601) |
| `completedBefore` | `string` | Filter orders completed before this date (ISO 8601) |
| `customerCode` | `string` | Filter by customer code |
| `customerId` | `string` | Filter by customer GUID |
| `customOrderStatus` | `string` | Filter by custom order status |
| `endDate` | `string` | Filter orders before this date (ISO 8601) |
| `modifiedSince` | `string` | Filter orders modified since this date (ISO 8601) |
| `orderNumber` | `string` | Filter by order number |
| `orderStatus` | `string` | Filter by order status (e.g., "Parked", "Placed", "Completed") |
| `pageSize` | `number` | Number of items per page (default: 200, max: 500) |
| `serialBatch` | `boolean` | Include serial/batch information |
| `sourceId` | `string` | Filter by source ID |
| `startDate` | `string` | Filter orders after this date (ISO 8601) |
| `warehouseCode` | `string` | Filter by warehouse code |

**Response:**

```typescript
interface UnleashedQueryResponse<SalesOrder> {
  Pagination: {
    NumberOfItems: number;
    PageSize: number;
    PageNumber: number;
    NumberOfPages: number;
  };
  Items: SalesOrder[];
}
```

**Examples:**

```typescript
// Get all parked orders
const parkedOrders = await unleashed.salesOrders.query({
  orderStatus: 'Parked',
  pageSize: 100
});

// Get orders for a specific customer
const customerOrders = await unleashed.salesOrders.query({
  customerCode: 'CUST001',
  startDate: '2024-01-01T00:00:00Z'
});

// Get recently modified orders
const recentOrders = await unleashed.salesOrders.query({
  modifiedSince: '2024-12-01T00:00:00Z',
  pageSize: 50
});

// Pagination example
console.log(`Total orders: ${parkedOrders.Pagination.NumberOfItems}`);
console.log(`Page ${parkedOrders.Pagination.PageNumber} of ${parkedOrders.Pagination.NumberOfPages}`);
parkedOrders.Items.forEach(order => {
  console.log(`Order ${order.OrderNumber}: ${order.Customer.CustomerName}`);
});
```

#### Get Single Sales Order

Retrieve a specific sales order by its GUID.

```typescript
async get(id: string): Promise<SalesOrder>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | The GUID of the sales order |

**Example:**

```typescript
const order = await unleashed.salesOrders.get('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

console.log(`Order: ${order.OrderNumber}`);
console.log(`Customer: ${order.Customer.CustomerName}`);
console.log(`Total: ${order.Currency.CurrencyCode} ${order.Total}`);
console.log(`Status: ${order.OrderStatus}`);

// Access order lines
order.SalesOrderLines.forEach(line => {
  console.log(`- ${line.Product.ProductDescription}: ${line.OrderQuantity} @ ${line.UnitPrice}`);
});
```

#### Update Sales Order

Update an existing sales order with optional hash-based change detection.

```typescript
async update(
  payload: SalesOrderUpdate,
  previousHash?: string
): Promise<{
  updated: boolean;
  salesOrder: SalesOrder | null;
  hash: string;
}>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `payload` | `SalesOrderUpdate` | The order data to update |
| `previousHash` | `string` (optional) | Hash of previous update to prevent duplicate updates |

**SalesOrderUpdate Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `Comments` | `string` | Order comments (max 2048 chars) |
| `CustomOrderStatus` | `string` | Custom order status (max 15 chars) |
| `DeliveryCity` | `string` | Delivery city |
| `DeliveryCountry` | `string` | Delivery country |
| `DeliveryInstruction` | `string` | Delivery instructions |
| `DeliveryMethod` | `string` | Delivery method |
| `DeliveryName` | `string` | Delivery recipient name |
| `DeliveryPostCode` | `string` | Delivery postal code |
| `DeliveryRegion` | `string` | Delivery region/state |
| `DeliveryStreetAddress` | `string` | Delivery street address line 1 |
| `DeliveryStreetAddress2` | `string` | Delivery street address line 2 |
| `DeliverySuburb` | `string` | Delivery suburb |
| `DiscountRate` | `number` | Discount rate (decimal, e.g., 0.1 for 10%) |
| `ExchangeRate` | `number` | Currency exchange rate |
| `OrderStatus` | `string` | Order status (max 20 chars) |
| `SalesOrderGroup` | `string` | Sales order group (max 50 chars) |
| `Salesperson` | `{ Guid: string }` | Salesperson GUID |
| `Tax` | `{ Guid: string }` | Tax code GUID |
| `Warehouse` | `{ Guid: string }` | Warehouse GUID |

**Response:**

- `updated`: `true` if the order was updated, `false` if skipped due to matching hash
- `salesOrder`: The updated order object (null if not updated)
- `hash`: SHA-256 hash of the update payload for change tracking

**Examples:**

```typescript
// Basic update
const result = await unleashed.salesOrders.update({
  Comments: 'Updated delivery instructions',
  DeliveryInstruction: 'Please call before delivery',
  OrderStatus: 'Placed',
  Salesperson: { Guid: 'sales-person-guid' },
  Tax: { Guid: 'tax-code-guid' },
  Warehouse: { Guid: 'warehouse-guid' },
  DiscountRate: 0,
  ExchangeRate: 1.0,
  CustomOrderStatus: 'Pending',
  DeliveryCity: 'Auckland',
  DeliveryCountry: 'New Zealand',
  DeliveryMethod: 'Courier',
  DeliveryName: 'John Doe',
  DeliveryPostCode: '1010',
  DeliveryRegion: 'Auckland',
  DeliveryStreetAddress: '123 Main St',
  DeliveryStreetAddress2: '',
  DeliverySuburb: 'CBD',
  SalesOrderGroup: ''
});

if (result.updated) {
  console.log('Order updated successfully');
}

// Update with hash-based change detection
let lastHash: string | undefined;

const update1 = await unleashed.salesOrders.update(payload, lastHash);
lastHash = update1.hash;

// This will be skipped if payload hasn't changed
const update2 = await unleashed.salesOrders.update(payload, lastHash);
console.log(update2.updated); // false - payload is identical
```

#### Complete Sales Order

Mark a sales order as completed.

```typescript
async complete(id: string): Promise<any>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | The GUID of the sales order to complete |

**Example:**

```typescript
const result = await unleashed.salesOrders.complete('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
console.log('Order completed successfully');
```

## Type Definitions

### SalesOrder

The complete sales order object returned by the API:

```typescript
interface SalesOrder {
  // Order Information
  OrderNumber: string;
  OrderStatus: string;
  CustomOrderStatus: string;
  OrderDate: string | null;
  RequiredDate: string | null;
  CompletedDate: string | null;
  ReceivedDate: string | null;
  Guid: string;
  
  // Customer Information
  Customer: {
    CustomerCode: string;
    CustomerName: string;
    Guid: string;
    CurrencyId: number;
    LastModifiedOn: string | null;
  };
  CustomerRef: string;
  
  // Financial Information
  Currency: {
    CurrencyCode: string;
    Description: string;
    DefaultBuyRate: number;
    DefaultSellRate: number;
    Guid: string;
    LastModifiedOn: string | null;
  };
  SubTotal: number;
  TaxTotal: number;
  Total: number;
  DiscountRate: number;
  ExchangeRate: number | null;
  
  // Base Currency (BC) amounts
  BCSubTotal: number | null;
  BCTaxTotal: number | null;
  BCTotal: number | null;
  
  // Delivery Information
  DeliveryName: string;
  DeliveryStreetAddress: string;
  DeliveryStreetAddress2: string;
  DeliverySuburb: string;
  DeliveryCity: string;
  DeliveryRegion: string;
  DeliveryPostCode: string;
  DeliveryCountry: string;
  DeliveryInstruction: string;
  DeliveryMethod: string;
  DeliveryContact: {
    FirstName: string;
    LastName: string;
    EmailAddress: string;
    MobilePhone: string;
    OfficePhone: string;
    PhoneNumber: string;
    Guid: string;
  };
  
  // Order Lines
  SalesOrderLines: Array<{
    Guid: string;
    LineNumber: number;
    LineType: string;
    Product: {
      Guid: string;
      ProductCode: string;
      ProductDescription: string;
    };
    OrderQuantity: number;
    UnitPrice: number;
    UnitCost: number | null;
    DiscountRate: number;
    LineTax: number;
    LineTotal: number;
    LineTaxCode: string;
    TaxRate: number | null;
    Comments: string;
    DueDate: string | null;
    BCUnitPrice: number;
    BCLineTax: number;
    BCLineTotal: number;
    Volume: number | null;
    Weight: number | null;
    Assembly: {
      Guid: string;
      AssemblyNumber: string;
      AssemblyStatus: string;
    };
    XeroSalesAccount: string;
    XeroTaxCode: string;
    CostOfGoodsAccount: string;
    LastModifiedOn: string | null;
  }>;
  
  // Other Information
  Salesperson: {
    Guid: string;
    FullName: string;
    Email: string;
    Obsolete: boolean;
    LastModifiedOn: string | null;
  };
  Warehouse: {
    Guid: string;
    WarehouseCode: string;
    WarehouseName: string;
    IsDefault: boolean;
    AddressLine1: string;
    AddressLine2: string;
    StreetNo: string;
    Suburb: string;
    City: string;
    Region: string;
    PostCode: string;
    Country: string;
    PhoneNumber: string;
    FaxNumber: string;
    MobileNumber: string;
    DDINumber: string;
    ContactName: string;
    Obsolete: boolean;
    LastModifiedOn: string | null;
  };
  Tax: {
    Guid: string;
    TaxCode: string;
    Description: string;
    TaxRate: number;
    CanApplyToExpenses: boolean;
    CanApplyToRevenue: boolean;
    Obsolete: boolean;
    LastModifiedOn: string | null;
  };
  TaxRate: number | null;
  XeroTaxCode: string;
  SalesAccount: string;
  SalesOrderGroup: string;
  SourceId: string;
  Comments: string;
  TotalVolume: number | null;
  TotalWeight: number | null;
  PaymentDueDate: string | null;
  CreatedBy: string;
  CreatedOn: string;
  LastModifiedBy: string;
  LastModifiedOn: string | null;
}
```

## Error Handling

The client throws standard Axios errors. Always wrap API calls in try-catch blocks:

```typescript
try {
  const order = await unleashed.salesOrders.get('invalid-guid');
} catch (error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error('API Error:', error.response.status);
    console.error('Error details:', error.response.data);
  } else if (error.request) {
    // The request was made but no response was received
    console.error('No response received:', error.request);
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('Error:', error.message);
  }
}
```

### Validation Errors

When input data doesn't match the expected schema, Zod will throw a validation error:

```typescript
import { z } from 'zod';

try {
  const orders = await unleashed.salesOrders.query({
    pageSize: 1000 // May exceed API limits
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Validation error:', error.errors);
  }
}
```

## Best Practices

### 1. Environment Variables

Store your credentials securely using environment variables:

```typescript
import { Unleashed } from '@first-light-dev/easify/unleashed';

const unleashed = new Unleashed({
  auth: {
    api: {
      id: process.env.UNLEASHED_API_ID!,
      key: process.env.UNLEASHED_API_KEY!
    },
    clientType: process.env.APP_NAME || 'MyApp'
  }
});
```

### 2. Pagination

When querying large datasets, use pagination:

```typescript
async function getAllOrders() {
  const allOrders = [];
  let pageNumber = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const response = await unleashed.salesOrders.query({
      pageSize: 200,
      orderStatus: 'Placed'
    });
    
    allOrders.push(...response.Items);
    
    hasMorePages = pageNumber < response.Pagination.NumberOfPages;
    pageNumber++;
  }
  
  return allOrders;
}
```

### 3. Change Detection

Use hash-based change detection to prevent unnecessary updates:

```typescript
// Store the hash from the last update
const cache = new Map<string, string>();

async function updateOrderIfChanged(orderId: string, payload: SalesOrderUpdate) {
  const previousHash = cache.get(orderId);
  
  const result = await unleashed.salesOrders.update(payload, previousHash);
  
  if (result.updated) {
    cache.set(orderId, result.hash);
    console.log('Order updated');
  } else {
    console.log('Order unchanged, update skipped');
  }
  
  return result;
}
```

Note: For the first time you're updating the order, you don't need to provide the previous hash.


### 4. Rate Limiting

While the client has built-in retry logic for 429 errors, consider implementing your own rate limiting for bulk operations:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent requests

const orderIds = ['id1', 'id2', 'id3', /* ... */];

const orders = await Promise.all(
  orderIds.map(id => 
    limit(() => unleashed.salesOrders.get(id))
  )
);
```

## API Reference

For complete API documentation, refer to the [Official Unleashed API Documentation](https://apidocs.unleashedsoftware.com/).
