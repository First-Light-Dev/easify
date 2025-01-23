# Easify

A lightweight, type-safe toolkit for Shopify application development, featuring GraphQL client and advanced logging capabilities.

## Features

- 🪶 Lightweight GraphQL client - only uses axios as runtime dependency
- 📝 Type-safe - full TypeScript support with GraphQL code generation
- 🛠️ Flexible - generate types only for the queries you need
- 🔒 Secure - built-in support for Shopify's authentication
- 📋 Advanced Logging - Bunyan-based logging with optional Discord notifications
- 🚨 Error Tracking - Automatic error reporting to Discord (optional)

## Installation

Install the main package:

    npm install easify

Install peer dependencies for type generation:

    npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations graphql

## Modules

### 1. GraphQL Client

#### Setup Type Generation

Create a codegen.yml in your project root:

[Example: codegen.yml]
schema: 'https://shopify.dev/admin-graphql-direct-proxy'
documents: 'src/**/*.graphql'
generates:
  src/generated/types.ts:
    plugins:
      - typescript
      - typescript-operations
    config:
      scalars:
        DateTime: string
        Date: string
        Decimal: string
        JSON: Record<string, any>
        URL: string
        ID: string
        Handle: string
        DateTimeWithoutTimezone: string
        TimeWithoutTimezone: string

Add to package.json:

[Example: package.json]
{
  "scripts": {
    "generate": "graphql-codegen"
  }
}

#### Create GraphQL Queries

[Example: src/queries/products.graphql]
query GetProducts($first: Int!) {
  products(first: $first) {
    edges {
      node {
        id
        title
        handle
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
}

#### Using the Client

[Example: src/example.ts]
import { ShopifyGraphQLClient } from 'easify';
import { GetProductsQuery, GetProductsQueryVariables } from './generated/types';

const client = new ShopifyGraphQLClient(
  'your-store.myshopify.com',
  'your-access-token'
);

async function fetchProducts() {
  const { data } = await client.query<GetProductsQuery, GetProductsQueryVariables>(
    GET_PRODUCTS,
    { first: 10 }
  );
  
  // data is fully typed!
  console.log(data.products.edges[0].node.title);
}

### 2. Logging

The LogHelper provides a singleton logging interface with optional Discord integration for error reporting.

#### Initialize Logger:

[Example: src/index.ts]
import { LogHelper } from 'easify';

LogHelper.initialize({
  serviceName: 'my-service',
  discord: {  // Optional Discord configuration
    webhookUrl: 'your-discord-webhook-url',
    userId: 'your-discord-user-id'
  },
  options: {  // Optional Bunyan options
    level: 'debug'
  }
});

#### Usage:

[Example: src/example.ts]
const logger = LogHelper.getInstance();

// Regular logging
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');

// Error logging (automatically notifies Discord if configured)
try {
  // Your code
} catch (error) {
  logger.error('Operation failed', error);
}

#### Logging Interface

The LogHelper provides the following methods:
- debug(message: string, ...args: any[]): void
- info(message: string, ...args: any[]): void
- warn(message: string, ...args: any[]): void
- error(message: string, error?: Error, ...args: any[]): void

#### Configuration Options

LogHelperOptions interface:
- serviceName: string - Name of your service
- discord?: {
    webhookUrl: string - Discord webhook URL
    userId: string - Discord user ID for notifications
  }
- options?: bunyan.LoggerOptions - Additional Bunyan logger options

## Common Scalar Types

The library includes proper TypeScript mappings for Shopify's custom scalar types:

- DateTime: string
- Date: string
- Decimal: string
- JSON: Record<string, any>
- URL: string
- ID: string
- Handle: string
- DateTimeWithoutTimezone: string
- TimeWithoutTimezone: string

## Best Practices

1. Store your GraphQL queries in .graphql files
2. Run type generation as part of your build process
3. Initialize LogHelper early in your application
4. Use environment variables for sensitive information (Discord webhooks, access tokens)
5. Configure appropriate log levels for different environments

## Error Handling

The library provides comprehensive error handling through:
- GraphQL error responses
- Network error handling
- Logging with stack traces
- Automatic Discord notifications for errors (when configured)

Example error handling:

[Example: src/error-handling.ts]
try {
  const { data } = await client.query(GET_PRODUCTS, { first: 10 });
} catch (error) {
  if (error.response) {
    logger.error('GraphQL Error', error);
  } else {
    logger.error('Network Error', error);
  }
}

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- Open an issue for bug reports or feature requests
- Submit pull requests for contributions
- Check our documentation for more information

## Roadmap

- Additional utility modules
- Common API integrations
- More helper classes and functions

---

Built with ❤️ for developers who value simplicity and maintainability.