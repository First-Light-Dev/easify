"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
class ShopifyGraphQLClient {
    constructor(shopDomain, accessToken, apiVersion = '2025-01', maxRetries = 3) {
        this.maxRetries = maxRetries;
        this.client = axios_1.default.create({
            baseURL: `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            }
        });
    }
    async query(query, variables) {
        var _a;
        let retryCount = 0;
        while (retryCount <= this.maxRetries) {
            try {
                const response = await this.client.post('', {
                    query,
                    variables
                });
                if (!response.data.errors) {
                    return response.data.data;
                }
                // Handle throttling
                const throttledError = response.data.errors.find(err => { var _a; return ((_a = err.extensions) === null || _a === void 0 ? void 0 : _a.code) === 'THROTTLED'; });
                if (throttledError && ((_a = response.data.extensions) === null || _a === void 0 ? void 0 : _a.cost)) {
                    const { throttleStatus, requestedQueryCost } = response.data.extensions.cost;
                    const waitSeconds = Math.ceil(requestedQueryCost / throttleStatus.restoreRate) + 1;
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                    retryCount++;
                    continue;
                }
                // Handle other errors
                const otherErrors = response.data.errors.filter(err => { var _a; return ((_a = err.extensions) === null || _a === void 0 ? void 0 : _a.code) !== 'THROTTLED'; });
                if (otherErrors.length > 0) {
                    throw new Error(`GraphQL Errors: ${JSON.stringify(otherErrors, null, 2)}`);
                }
            }
            catch (error) {
                if (retryCount === this.maxRetries) {
                    throw error;
                }
                retryCount++;
            }
        }
        throw new Error('Max retries exceeded');
    }
}
exports.default = ShopifyGraphQLClient;
