import { AxiosInstance } from 'axios';
import type { AdminQueries, AdminMutations, PkgAdminMutations, PkgAdminQueries } from '@shopify/admin-api-client';
type CombinedAdminQueries = AdminQueries & PkgAdminQueries;
type CombinedAdminMutations = AdminMutations & PkgAdminMutations;
export default class ShopifyGraphQLClient {
    protected client: AxiosInstance;
    private readonly maxRetries;
    constructor(shopDomain: string, accessToken: string, apiVersion?: string, maxRetries?: number);
    query<T extends keyof (CombinedAdminQueries & CombinedAdminMutations)>(query: T | string, variables?: (CombinedAdminQueries & CombinedAdminMutations)[T extends keyof (CombinedAdminQueries & CombinedAdminMutations) ? T : never]['variables']): Promise<(CombinedAdminQueries & CombinedAdminMutations)[T extends keyof (CombinedAdminQueries & CombinedAdminMutations) ? T : never]['return']>;
}
export {};
