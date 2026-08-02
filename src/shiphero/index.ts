import * as path from 'path';

/**
 * A client for the ShipHero public GraphQL API (https://developer.shiphero.com/).
 *
 * The client is a transport only: it handles token auth, refresh, credit throttling
 * and the rolling request ceiling, and executes whatever document you hand it. Queries
 * live in the calling project, generated against {@link SHIPHERO_SCHEMA_PATH} so adding
 * one never requires a change here.
 *
 * ```ts
 * import { ShipHero } from 'easify/shiphero';
 * import { PurchaseOrdersDocument } from './generated/shiphero';
 *
 * const shiphero = new ShipHero({
 *   auth: { accessToken: '...', refreshToken: '...' },
 *   options: { customerAccountId: 'QWNjb3VudDoxMjM0' }
 * });
 *
 * // Result and variables are inferred from the generated document.
 * const data = await shiphero.query(PurchaseOrdersDocument, { updatedFrom: lastRun });
 * ```
 */
export { ShipHeroClient as ShipHero } from './client';
export { default } from './client';

/**
 * Absolute path to the bundled SDL for the ShipHero schema. ShipHero publishes no
 * introspection endpoint, so point graphql-codegen at this file:
 *
 * ```ts
 * import { SHIPHERO_SCHEMA_PATH } from 'easify/shiphero';
 *
 * export default {
 *   schema: SHIPHERO_SCHEMA_PATH,
 *   documents: ['src/**\/*.graphql'],
 *   generates: { './src/generated/shiphero.ts': { plugins: [...] } }
 * };
 * ```
 */
export const SHIPHERO_SCHEMA_PATH = path.join(__dirname, 'generated', 'schema.graphql');

export * from './client';
export * from './errors';
export * from './generated';
