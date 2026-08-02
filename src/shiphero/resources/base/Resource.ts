import { ShipHeroClient } from '../../client';
import { ShipHeroError } from '../../errors';
import {
  SHIPHERO_MUTATIONS,
  SHIPHERO_QUERIES,
  ShipHeroOperationMeta
} from '../../generated/metadata';

/**
 * Largest Relay page ShipHero serves. Requesting more rows raises the estimated
 * complexity, though unused rows are credited back.
 */
export const MAX_PAGE_SIZE = 100;

/** GraphQL variable names used for pagination, kept distinct from operation arguments. */
const PAGE_VARS = { first: 'page_first', after: 'page_after', sort: 'page_sort' } as const;

export interface PageOptions {
  /** Rows to request. Defaults to 100, ShipHero's maximum. */
  first?: number;
  /** Cursor from a previous page's `endCursor`. */
  after?: string;
  /** Comma separated fields, `-` prefix for descending, e.g. `'-created_at'`. */
  sort?: string;
  /** Replaces the resource's default node selection set. */
  selection?: string;
}

export interface ListAllOptions extends PageOptions {
  /** Stops once this many nodes have been collected. */
  max?: number;
}

export interface Page<TNode> {
  nodes: TNode[];
  edges: { cursor?: string; node: TNode }[];
  hasNextPage: boolean;
  endCursor?: string;
  requestId?: string;
  /** Credits the operation actually cost. */
  complexity?: number;
}

export interface GetOptions {
  /** Replaces the resource's default selection set. */
  selection?: string;
}

/**
 * Arguments for an operation. Typed as `object` rather than
 * `Record<string, unknown>` so the generated argument interfaces are assignable.
 */
export type OperationArgs = object;

export interface MutateOptions {
  /** Replaces the resource's default selection set for the returned payload. */
  selection?: string;
}

/** Serialises a GraphQL type map into a variable declaration list. */
function declareVariables(variableTypes: Record<string, string>): string {
  const entries = Object.entries(variableTypes);
  return entries.length ? `(${entries.map(([name, type]) => `$${name}: ${type}`).join(', ')})` : '';
}

/** Serialises `{ sku: 'sku' }` into `sku: $sku`. */
function passVariables(mapping: Record<string, string>): string {
  const entries = Object.entries(mapping);
  return entries.length
    ? `(${entries.map(([arg, variable]) => `${arg}: $${variable}`).join(', ')})`
    : '';
}

export abstract class BaseResource {
  constructor(protected readonly client: ShipHeroClient) {}

  protected queryMeta(operation: string): ShipHeroOperationMeta {
    const meta = SHIPHERO_QUERIES[operation];
    if (!meta) throw new ShipHeroError(`Unknown ShipHero query '${operation}'`);
    return meta;
  }

  protected mutationMeta(operation: string): ShipHeroOperationMeta {
    const meta = SHIPHERO_MUTATIONS[operation];
    if (!meta) throw new ShipHeroError(`Unknown ShipHero mutation '${operation}'`);
    return meta;
  }

  /**
   * Drops undefined arguments, keeps only arguments the operation declares, and
   * applies the client's default `customer_account_id` for 3PL users.
   */
  protected prepareArgs(meta: ShipHeroOperationMeta, args: OperationArgs): Record<string, unknown> {
    const prepared: Record<string, unknown> = {};

    for (const [name, value] of Object.entries(args as Record<string, unknown>)) {
      if (value === undefined) continue;
      if (!(name in meta.argTypes)) {
        throw new ShipHeroError(`'${name}' is not an argument of ShipHero ${meta.name}`);
      }
      prepared[name] = value;
    }

    const fallback = this.client.customerAccountId;
    if (!fallback) return prepared;

    if (meta.customerAccountId === 'arg' && prepared.customer_account_id === undefined) {
      prepared.customer_account_id = fallback;
    } else if (meta.customerAccountId === 'data' && isPlainObject(prepared.data)) {
      const data = prepared.data as Record<string, unknown>;
      if (data.customer_account_id === undefined) {
        prepared.data = { ...data, customer_account_id: fallback };
      }
    }

    return prepared;
  }

  /** Runs a query whose payload is a single object rather than a connection. */
  protected async fetchObject<TNode>(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: GetOptions = {}
  ): Promise<TNode | null> {
    const meta = this.queryMeta(operation);
    const prepared = this.prepareArgs(meta, args);
    const variableTypes = Object.fromEntries(
      Object.keys(prepared).map((name) => [name, meta.argTypes[name]])
    );
    const mapping = Object.fromEntries(Object.keys(prepared).map((name) => [name, name]));
    const body = options.selection ?? selection;

    const document = [
      `query ${operation}${declareVariables(variableTypes)} {`,
      `  ${operation}${passVariables(mapping)} {`,
      '    request_id',
      '    complexity',
      renderPayload(meta, body, 4),
      '  }',
      '}'
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const response = await this.client.request<Record<string, Record<string, unknown>>>(
      document,
      prepared,
      { operationName: operation }
    );

    const result = response[operation];
    const payload = meta.payloadField ? result?.[meta.payloadField] : result;
    return (payload as TNode | undefined) ?? null;
  }

  /** Runs a single page of a connection-backed query. */
  protected async fetchPage<TNode>(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: PageOptions = {}
  ): Promise<Page<TNode>> {
    const meta = this.queryMeta(operation);
    if (!meta.paginated) {
      throw new ShipHeroError(`ShipHero ${operation} does not return a connection`);
    }

    const prepared = this.prepareArgs(meta, args);
    const variableTypes: Record<string, string> = Object.fromEntries(
      Object.keys(prepared).map((name) => [name, meta.argTypes[name]])
    );
    const mapping = Object.fromEntries(Object.keys(prepared).map((name) => [name, name]));

    const variables: Record<string, unknown> = { ...prepared };
    const pageMapping: Record<string, string> = {};

    // Always bound the page: an unbounded connection is estimated at 100 rows and
    // nested connections multiply that estimate.
    variableTypes[PAGE_VARS.first] = meta.payloadArgTypes.first ?? 'Int';
    variables[PAGE_VARS.first] = Math.min(options.first ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    pageMapping.first = PAGE_VARS.first;

    if (options.after !== undefined) {
      variableTypes[PAGE_VARS.after] = meta.payloadArgTypes.after ?? 'String';
      variables[PAGE_VARS.after] = options.after;
      pageMapping.after = PAGE_VARS.after;
    }

    if (options.sort !== undefined && meta.payloadArgTypes.sort) {
      variableTypes[PAGE_VARS.sort] = meta.payloadArgTypes.sort;
      variables[PAGE_VARS.sort] = options.sort;
      pageMapping.sort = PAGE_VARS.sort;
    }

    const body = options.selection ?? selection;
    const document = [
      `query ${operation}${declareVariables(variableTypes)} {`,
      `  ${operation}${passVariables(mapping)} {`,
      '    request_id',
      '    complexity',
      `    ${meta.payloadField ?? 'data'}${passVariables(pageMapping)} {`,
      '      pageInfo { hasNextPage endCursor }',
      '      edges {',
      '        cursor',
      '        node {',
      indent(body, 10),
      '        }',
      '      }',
      '    }',
      '  }',
      '}'
    ].join('\n');

    const response = await this.client.request<Record<string, ConnectionResult<TNode>>>(
      document,
      variables,
      { operationName: operation }
    );

    const result = response[operation] ?? {};
    const connection = (meta.payloadField ? (result as any)[meta.payloadField] : result) ?? {};
    const edges = (connection.edges ?? []).filter((edge: any) => edge?.node);

    return {
      nodes: edges.map((edge: any) => edge.node as TNode),
      edges,
      hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
      endCursor: connection.pageInfo?.endCursor ?? undefined,
      requestId: result.request_id ?? undefined,
      complexity: result.complexity ?? undefined
    };
  }

  /** Walks a connection until ShipHero reports no further pages. */
  protected async *iteratePages<TNode>(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: ListAllOptions = {}
  ): AsyncGenerator<Page<TNode>, void, void> {
    let after = options.after;
    let collected = 0;

    for (;;) {
      const page = await this.fetchPage<TNode>(operation, args, selection, { ...options, after });
      if (!page.nodes.length) return;

      yield page;

      collected += page.nodes.length;
      if (options.max !== undefined && collected >= options.max) return;
      if (!page.hasNextPage || !page.endCursor) return;
      after = page.endCursor;
    }
  }

  /** Collects every node in a connection, honouring `max` when supplied. */
  protected async collect<TNode>(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: ListAllOptions = {}
  ): Promise<TNode[]> {
    const nodes: TNode[] = [];
    for await (const page of this.iteratePages<TNode>(operation, args, selection, options)) {
      nodes.push(...page.nodes);
      if (options.max !== undefined && nodes.length >= options.max)
        return nodes.slice(0, options.max);
    }
    return nodes;
  }

  /**
   * Returns what a query would cost without running it, using ShipHero's `analyze`
   * argument. Useful before widening a page size or selection set.
   */
  protected async estimate(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: PageOptions = {}
  ): Promise<number> {
    const meta = this.queryMeta(operation);
    if (!meta.argTypes.analyze) {
      throw new ShipHeroError(`ShipHero ${operation} does not support analyze`);
    }

    if (meta.paginated) {
      const page = await this.fetchPage(operation, { ...args, analyze: true }, selection, options);
      return page.complexity ?? 0;
    }

    await this.fetchObject(operation, { ...args, analyze: true }, selection, options);
    return this.client.lastCost.complexity ?? 0;
  }

  /** Runs a mutation and returns its payload field. */
  protected async runMutation<TResult>(
    operation: string,
    args: OperationArgs,
    selection: string,
    options: MutateOptions = {}
  ): Promise<TResult> {
    const meta = this.mutationMeta(operation);
    const prepared = this.prepareArgs(meta, args);
    const variableTypes = Object.fromEntries(
      Object.keys(prepared).map((name) => [name, meta.argTypes[name]])
    );
    const mapping = Object.fromEntries(Object.keys(prepared).map((name) => [name, name]));
    const body = options.selection ?? selection;

    const document = [
      `mutation ${operation}${declareVariables(variableTypes)} {`,
      `  ${operation}${passVariables(mapping)} {`,
      '    request_id',
      '    complexity',
      renderPayload(meta, body, 4),
      '  }',
      '}'
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const response = await this.client.request<Record<string, Record<string, unknown>>>(
      document,
      prepared,
      { operationName: operation }
    );

    const result = response[operation];
    const payload = meta.payloadField ? result?.[meta.payloadField] : result;
    return (payload ?? result) as TResult;
  }
}

interface ConnectionResult<TNode> {
  request_id?: string | null;
  complexity?: number | null;
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null };
  edges?: { cursor?: string; node?: TNode }[];
  [key: string]: unknown;
}

/** A field name with optional arguments, or a brace. */
const SELECTION_TOKEN = /[^\s{}()]+(?:\([^)]*\))?|[{}]/g;

/**
 * Reformats a selection set at `spaces` of indentation, one field per line and nested
 * by brace depth. Selections are composed from templates whose own indentation varies,
 * so normalising here keeps logged documents readable.
 */
function indent(value: string, spaces: number): string {
  const lines: string[] = [];
  let depth = 0;

  for (const [token] of value.matchAll(SELECTION_TOKEN)) {
    if (token === '{') {
      if (lines.length) lines[lines.length - 1] += ' {';
      depth++;
    } else if (token === '}') {
      depth = Math.max(0, depth - 1);
      lines.push(' '.repeat(spaces + depth * 2) + '}');
    } else {
      lines.push(' '.repeat(spaces + depth * 2) + token);
    }
  }

  return lines.join('\n');
}

/** GraphQL built-in scalars, which must be selected without a sub-selection. */
const SCALAR_TYPES = new Set(['String', 'ID', 'Int', 'Float', 'Boolean']);

/**
 * Renders the payload part of an operation body: a sub-selection for object payloads,
 * a bare field for scalar payloads such as the `ok` a delete mutation returns.
 */
function renderPayload(
  meta: ShipHeroOperationMeta,
  selection: string,
  depth: number
): string | undefined {
  const pad = ' '.repeat(depth);

  if (!meta.payloadField) return selection.trim() ? indent(selection, depth) : undefined;
  if (meta.payloadType && SCALAR_TYPES.has(meta.payloadType)) return `${pad}${meta.payloadField}`;
  if (!selection.trim()) return undefined;

  return `${pad}${meta.payloadField} {\n${indent(selection, depth + 2)}\n${pad}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Splits a date range into windows no longer than `days`, for endpoints that cap it. */
export function dateWindows(
  from: Date | string,
  to: Date | string,
  days: number
): { from: string; to: string }[] {
  const start = new Date(from);
  const end = new Date(to);
  const span = days * 24 * 60 * 60 * 1000;
  const windows: { from: string; to: string }[] = [];

  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const next = Math.min(cursor + span, end.getTime());
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }

  return windows.length ? windows : [{ from: start.toISOString(), to: end.toISOString() }];
}

/** Normalises a `Date` or string into the ISO-8601 form ShipHero expects. */
export function toISO(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}
