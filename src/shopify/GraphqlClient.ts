import axios, { AxiosInstance } from 'axios';

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface ShopifyGraphQLError {
  message: string;
  locations: { line: number; column: number; }[];
  extensions?: {
    code: string;
    documentation?: string;
  };
  path?: string[];
}

interface ShopifyGraphQLResponse<T> {
  data: T;
  errors?: ShopifyGraphQLError[];
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: ThrottleStatus;
    };
  };
}

export class ShopifyGraphQLClient {
  protected client: AxiosInstance;
  private readonly maxRetries: number;

  constructor(
    shopDomain: string,
    accessToken: string,
    apiVersion = '2025-01',
    maxRetries = 3
  ) {
    this.maxRetries = maxRetries;
    this.client = axios.create({
      baseURL: `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
  }

  async query<T = any, V = any>(
    query: string,
    variables?: V
  ): Promise<T> {
    let retryCount = 0;

    while (retryCount <= this.maxRetries) {
      try {
        const response = await this.client.post<ShopifyGraphQLResponse<T>>('', {
          query,
          variables
        });

        if (!response.data.errors) {
          return response.data.data;
        }

        // Handle throttling
        const throttledError = response.data.errors.find(
          err => err.extensions?.code === 'THROTTLED'
        );

        if (throttledError && response.data.extensions?.cost) {
          const { throttleStatus, requestedQueryCost } = response.data.extensions.cost;
          const waitSeconds = Math.ceil(requestedQueryCost / throttleStatus.restoreRate) + 1;
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          retryCount++;
          continue;
        }

        // Handle other errors
        const otherErrors = response.data.errors.filter(
          err => err.extensions?.code !== 'THROTTLED'
        );
        if (otherErrors.length > 0) {
          throw new Error(`GraphQL Errors: ${JSON.stringify(otherErrors, null, 2)}`);
        }
      } catch (error) {
        if (retryCount === this.maxRetries) {
          throw error;
        }
        retryCount++;
      }
    }

    throw new Error('Max retries exceeded');
  }
}