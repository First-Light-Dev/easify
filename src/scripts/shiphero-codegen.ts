/**
 * Renders src/shiphero/generated/schema.graphql from the ShipHero GraphQL schema
 * reference published at https://developer.shiphero.com/schema/.
 *
 * Usage:
 *   ts-node src/scripts/shiphero-codegen.ts [--refresh]
 *
 * ShipHero does not publish an introspection dump, but the schema reference is
 * generated from the live schema on every release and every type, query and
 * mutation has its own page with a machine-readable field table. Pages are
 * cached under .cache/shiphero-schema so reruns are offline; pass --refresh to
 * re-download.
 *
 * The SDL is the only output. Projects using this package run graphql-codegen
 * against it and generate types for their own operations, so no TypeScript is
 * generated or published here.
 */

import * as fs from 'fs';
import * as graphql from 'graphql';
import * as path from 'path';

const SCHEMA_BASE = 'https://developer.shiphero.com/schema';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'shiphero-schema');
const OUT_DIR = path.join(__dirname, '..', 'shiphero', 'generated');
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 6;

type TypeKind = 'object' | 'input' | 'enum' | 'scalar' | 'interface' | 'union';

interface FieldDef {
  name: string;
  /** GraphQL type as written in the docs, e.g. `[CreateOrderLineItemInput]!`. */
  type: string;
  description?: string;
  deprecated?: string;
  required?: boolean;
  default?: string;
  /** Arguments the field itself accepts, e.g. the Relay args on a connection field. */
  args?: FieldDef[];
}

interface TypeDef {
  name: string;
  kind: TypeKind;
  description?: string;
  fields: FieldDef[];
  enumValues: { name: string; description?: string }[];
  possibleTypes: string[];
  /** Interfaces the type declares, as listed in the docs' `Implements` section. */
  interfaces: string[];
}

interface OperationDef {
  name: string;
  kind: 'query' | 'mutation';
  description?: string;
  args: FieldDef[];
  returnType?: string;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function loadPage(slug: string, refresh: boolean): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${slug.replace(/\//g, '__')}.html`);
  if (!refresh && fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf8');

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${SCHEMA_BASE}/${slug}.html`);
    if (response.ok) {
      const html = await response.text();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, html);
      return html;
    }

    lastStatus = response.status;
    // The docs CDN throttles bursts with 429/503; anything else is a real failure.
    if (response.status !== 429 && response.status !== 503) break;
    await sleep(500 * 2 ** attempt + Math.random() * 500);
  }

  throw new Error(`Failed to download ${slug}: ${lastStatus}`);
}

async function loadPages(slugs: string[], refresh: boolean): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < slugs.length) {
      const slug = slugs[cursor++];
      pages.set(slug, await loadPage(slug, refresh));
      done++;
      if (done % 100 === 0) console.log(`  fetched ${done}/${slugs.length}`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return pages;
}

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Strips tags and collapses whitespace, keeping comment markers safe to embed. */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\*\//g, '*\u200B/')
    .trim();
}

/** Keeps the GraphQL type punctuation (`[`, `]`, `!`) while dropping markup. */
function typeText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, '')
    .trim();
}

function mainContent(html: string): string {
  const start = html.indexOf('<main class="content">');
  return start === -1 ? html : html.slice(start);
}

function sectionAfter(html: string, heading: string): string | undefined {
  const marker = `<h2>${heading}</h2>`;
  const start = html.indexOf(marker);
  if (start === -1) return undefined;
  const rest = html.slice(start + marker.length);
  const end = rest.search(/<h2>|<footer/);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Matches the nested argument table the docs attach to the field above it. These
 * tables nest a `<tbody>` inside the outer one, so they are pulled out before the
 * outer table is parsed.
 */
const FIELD_ARGS_ROW = /<tr class="field-args-row">[\s\S]*?<\/div><\/td><\/tr>/g;

function rowCells(body: string): string[][] {
  return Array.from(body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)).map((row) =>
    Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((cell) => cell[1])
  );
}

/** Replaces each nested argument table with a marker so the outer table parses cleanly. */
function extractFieldArgs(section: string): { stripped: string; blocks: string[] } {
  const blocks: string[] = [];
  const stripped = section.replace(FIELD_ARGS_ROW, (block) => {
    blocks.push(block);
    return `<!--ARGS:${blocks.length - 1}-->`;
  });
  return { stripped, blocks };
}

function tableBody(section: string): string | undefined {
  return section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
}

function tableRows(section: string): string[][] {
  const body = tableBody(extractFieldArgs(section).stripped);
  return body ? rowCells(body) : [];
}

/**
 * Pairs each field row with the arguments the field itself accepts, so a connection
 * field's Relay arguments are not mistaken for properties of the parent type.
 */
function fieldRowsWithArgs(section: string): { cells: string[]; args: string[][] }[] {
  const { stripped, blocks } = extractFieldArgs(section);
  const body = tableBody(stripped);
  if (!body) return [];

  const rows: { cells: string[]; args: string[][] }[] = [];
  for (const token of body.matchAll(/<tr>([\s\S]*?)<\/tr>|<!--ARGS:(\d+)-->/g)) {
    if (token[2] !== undefined) {
      if (rows.length) rows[rows.length - 1].args = rowCells(blocks[Number(token[2])]);
      continue;
    }
    rows.push({
      cells: Array.from(token[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((cell) => cell[1]),
      args: []
    });
  }

  return rows;
}

function description(html: string): string | undefined {
  const raw = html.match(/<div class="description">([\s\S]*?)<\/div>/)?.[1];
  const value = raw ? text(raw) : '';
  return value || undefined;
}

function fieldFromCells(cells: string[], withRequired: boolean): FieldDef | undefined {
  if (!cells.length) return undefined;
  const name = text(cells[0] ?? '').replace(/\s+/g, '');
  if (!name) return undefined;

  const descriptionCell = cells[withRequired ? 4 : 2] ?? '';
  const field: FieldDef = {
    name,
    type: typeText(cells[1] ?? '') || 'String',
    description:
      text(descriptionCell.replace(/<span class="deprecation-reason">[\s\S]*?<\/span>/, ''))
        .replace(/^DEPRECATED\s*/, '')
        .trim() || undefined,
    deprecated:
      text(
        descriptionCell.match(/<span class="deprecation-reason">([\s\S]*?)<\/span>/)?.[1] ?? ''
      ) || undefined
  };

  if (withRequired) {
    field.required = /^yes$/i.test(text(cells[2] ?? ''));
    field.default = text(cells[3] ?? '') || undefined;
  }

  return field;
}

function parseTypePage(html: string): TypeDef | undefined {
  const content = mainContent(html);
  const heading = content.match(
    /<h1><span class="kind-label">([a-z]+)<\/span>\s*([A-Za-z0-9_]+)<\/h1>/
  );
  if (!heading) return undefined;

  const def: TypeDef = {
    kind: heading[1] as TypeKind,
    name: heading[2],
    description: description(content),
    fields: [],
    enumValues: [],
    possibleTypes: [],
    interfaces: []
  };

  const fields = sectionAfter(content, 'Fields');
  if (fields) {
    for (const row of fieldRowsWithArgs(fields)) {
      const field = fieldFromCells(row.cells, false);
      if (!field) continue;
      const args = row.args
        .map((cells) => fieldFromCells(cells, true))
        .filter((arg): arg is FieldDef => Boolean(arg));
      if (args.length) field.args = args;
      def.fields.push(field);
    }
  }

  const values = sectionAfter(content, 'Values');
  if (values) {
    for (const cells of tableRows(values)) {
      const name = text(cells[0] ?? '');
      if (name) def.enumValues.push({ name, description: text(cells[1] ?? '') || undefined });
    }
  }

  const possible = sectionAfter(content, 'Possible Types') ?? sectionAfter(content, 'Types');
  if (possible && def.kind === 'union') {
    for (const match of possible.matchAll(/<a href="\.\.\/types\/[^"]+">([A-Za-z0-9_]+)<\/a>/g)) {
      def.possibleTypes.push(match[1]);
    }
  }

  const implemented = sectionAfter(content, 'Implements');
  if (implemented) {
    for (const match of implemented.matchAll(
      /<a href="\.\.\/types\/[^"]+">([A-Za-z0-9_]+)<\/a>/g
    )) {
      def.interfaces.push(match[1]);
    }
  }

  return def;
}

function parseOperationPage(html: string, kind: 'query' | 'mutation'): OperationDef | undefined {
  const content = mainContent(html);
  const name = content.match(/<h1>([A-Za-z0-9_]+)<\/h1>/)?.[1];
  if (!name) return undefined;

  const def: OperationDef = {
    name,
    kind,
    description: description(content),
    args: [],
    returnType: undefined
  };

  const args = sectionAfter(content, 'Arguments');
  if (args) {
    for (const cells of tableRows(args)) {
      const field = fieldFromCells(cells, true);
      if (field) def.args.push(field);
    }
  }

  const returnSection = sectionAfter(content, 'Return Type');
  def.returnType = returnSection?.match(/<a href="\.\.\/types\/[^"]+">([A-Za-z0-9_]+)<\/a>/)?.[1];

  return def;
}

// ---------------------------------------------------------------------------
// SDL rendering
// ---------------------------------------------------------------------------

const BUILTIN_SCALARS = new Set(['String', 'ID', 'Int', 'Float', 'Boolean']);

/** Descriptions are collapsed to a single line upstream, so a quoted string is enough. */
function sdlDescription(value: string | undefined, pad = ''): string {
  return value ? `${pad}${JSON.stringify(value)}\n` : '';
}

function sdlDeprecated(reason: string | undefined): string {
  return reason ? ` @deprecated(reason: ${JSON.stringify(reason)})` : '';
}

/**
 * The docs split nullability across two columns for arguments: the type column
 * usually carries the `!`, but the required column is authoritative when it does not.
 */
function sdlTypeRef(field: FieldDef): string {
  const type = field.type || 'String';
  return field.required && !type.endsWith('!') ? `${type}!` : type;
}

/** Emits a default only when the documented text is a parseable GraphQL literal. */
function sdlDefault(field: FieldDef, gql: typeof import('graphql')): string {
  if (!field.default) return '';
  try {
    gql.parseValue(field.default);
    return ` = ${field.default}`;
  } catch {
    return '';
  }
}

function sdlArgs(args: FieldDef[] | undefined, gql: typeof import('graphql')): string {
  if (!args?.length) return '';
  const rendered = args.map((arg) => `${arg.name}: ${sdlTypeRef(arg)}${sdlDefault(arg, gql)}`);
  return `(${rendered.join(', ')})`;
}

/**
 * Renders the whole schema as SDL. ShipHero exposes no introspection endpoint, so
 * this file is what lets a consuming project run graphql-codegen against the API.
 */
function renderSDL(
  types: Map<string, TypeDef>,
  operations: OperationDef[],
  gql: typeof import('graphql')
): { sdl: string; warnings: string[] } {
  const warnings: string[] = [];
  const referenced = new Set<string>();
  const note = (type: string) => {
    const bare = type.replace(/[[\]!]/g, '');
    if (bare) referenced.add(bare);
  };

  for (const def of types.values()) {
    for (const name of def.interfaces) referenced.add(name);
    for (const name of def.possibleTypes) referenced.add(name);
    for (const field of def.fields) {
      note(field.type);
      for (const arg of field.args ?? []) note(arg.type);
    }
  }
  for (const op of operations) {
    for (const arg of op.args) note(arg.type);
    if (op.returnType) note(op.returnType);
  }

  const blocks: string[] = [];
  const byKind = (kind: TypeKind) =>
    [...types.values()]
      .filter((def) => def.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));

  // Any type the docs reference but never define has to be declared as a custom
  // scalar, otherwise the schema will not build.
  const undeclared = [...referenced]
    .filter((name) => !types.has(name) && !BUILTIN_SCALARS.has(name))
    .sort();
  if (undeclared.length)
    warnings.push(`Undocumented types emitted as scalars: ${undeclared.join(', ')}`);

  for (const name of [...byKind('scalar').map((def) => def.name), ...undeclared].sort()) {
    if (BUILTIN_SCALARS.has(name)) continue;
    blocks.push(`${sdlDescription(types.get(name)?.description)}scalar ${name}`);
  }

  for (const def of byKind('enum')) {
    const values = def.enumValues.length
      ? def.enumValues.map((v) => `${sdlDescription(v.description, '  ')}  ${v.name}`)
      : ['  UNKNOWN'];
    if (!def.enumValues.length) warnings.push(`Enum ${def.name} has no documented values`);
    blocks.push(`${sdlDescription(def.description)}enum ${def.name} {\n${values.join('\n')}\n}`);
  }

  const renderFields = (def: TypeDef, input: boolean) =>
    def.fields.map((field) => {
      // @deprecated on input fields is only valid for optional ones, so it is
      // simply left off inputs rather than risking an invalid schema.
      const suffix = input ? '' : sdlDeprecated(field.deprecated);
      const args = input ? '' : sdlArgs(field.args, gql);
      return `${sdlDescription(field.description, '  ')}  ${field.name}${args}: ${sdlTypeRef(
        field
      )}${suffix}`;
    });

  for (const kind of ['interface', 'object'] as const) {
    for (const def of byKind(kind)) {
      if (!def.fields.length) {
        // GraphQL forbids an empty object, so a fieldless type degrades to a scalar.
        warnings.push(`${def.name} has no documented fields; emitted as a scalar`);
        blocks.push(`${sdlDescription(def.description)}scalar ${def.name}`);
        continue;
      }
      const keyword = kind === 'interface' ? 'interface' : 'type';
      const implts = def.interfaces.length ? ` implements ${def.interfaces.join(' & ')}` : '';
      blocks.push(
        `${sdlDescription(def.description)}${keyword} ${def.name}${implts} {\n${renderFields(
          def,
          false
        ).join('\n')}\n}`
      );
    }
  }

  for (const def of byKind('union')) {
    if (!def.possibleTypes.length) {
      warnings.push(`Union ${def.name} has no members; emitted as a scalar`);
      blocks.push(`${sdlDescription(def.description)}scalar ${def.name}`);
      continue;
    }
    blocks.push(
      `${sdlDescription(def.description)}union ${def.name} = ${def.possibleTypes.join(' | ')}`
    );
  }

  for (const def of byKind('input')) {
    if (!def.fields.length) {
      warnings.push(`Input ${def.name} has no documented fields; emitted as a scalar`);
      blocks.push(`${sdlDescription(def.description)}scalar ${def.name}`);
      continue;
    }
    blocks.push(
      `${sdlDescription(def.description)}input ${def.name} {\n${renderFields(def, true).join(
        '\n'
      )}\n}`
    );
  }

  const renderRoot = (name: 'Query' | 'Mutation', kind: 'query' | 'mutation') => {
    const ops = operations
      .filter((op) => op.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));
    const fields = ops.map((op) => {
      if (!op.returnType)
        warnings.push(`${op.kind} ${op.name} has no return type; defaulted to Boolean`);
      return `${sdlDescription(op.description, '  ')}  ${op.name}${sdlArgs(op.args, gql)}: ${
        op.returnType ?? 'Boolean'
      }`;
    });
    blocks.push(`type ${name} {\n${fields.join('\n')}\n}`);
  };

  renderRoot('Query', 'query');
  renderRoot('Mutation', 'mutation');

  const sdl = [
    '# Generated by src/scripts/shiphero-codegen.ts from the ShipHero GraphQL schema',
    '# reference (https://developer.shiphero.com/schema/).',
    '# Run `yarn codegen:shiphero` to regenerate. Do not edit by hand.',
    '',
    'schema {',
    '  query: Query',
    '  mutation: Mutation',
    '}',
    '',
    ...blocks.map((block) => `${block}\n`)
  ].join('\n');

  return { sdl, warnings };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const refresh = process.argv.includes('--refresh');

  console.log('Loading schema index...');
  const index = await loadPage('index', refresh);
  const slugs = new Set<string>();
  for (const match of index.matchAll(/href="((?:types|queries|mutations)\/[a-z0-9-]+)\.html"/g)) {
    slugs.add(match[1]);
  }
  console.log(`Found ${slugs.size} schema pages`);

  const pages = await loadPages([...slugs], refresh);

  const types = new Map<string, TypeDef>();
  const operations: OperationDef[] = [];

  for (const [slug, html] of pages) {
    if (slug.startsWith('types/')) {
      const def = parseTypePage(html);
      if (def) types.set(def.name, def);
    } else {
      const def = parseOperationPage(html, slug.startsWith('queries/') ? 'query' : 'mutation');
      if (def) operations.push(def);
    }
  }

  const byKind = (kind: TypeKind) =>
    [...types.values()]
      .filter((def) => def.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));

  const enums = byKind('enum');
  const scalars = byKind('scalar');
  const inputs = byKind('input');
  const objects = [...byKind('object'), ...byKind('interface')].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const unions = byKind('union');

  console.log(
    `Parsed ${objects.length} objects, ${inputs.length} inputs, ${enums.length} enums, ` +
      `${scalars.length} scalars, ${unions.length} unions, ${operations.length} operations`
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // schema.graphql is the only output. Consumers generate their own TypeScript from
  // it, so their types describe the selection sets they actually use.
  const { sdl, warnings } = renderSDL(types, operations, graphql);
  fs.writeFileSync(path.join(OUT_DIR, 'schema.graphql'), sdl);
  try {
    const schema = graphql.buildSchema(sdl, { assumeValidSDL: false });
    const errors = graphql.validateSchema(schema);
    if (errors.length) {
      throw new Error(errors.map((error) => error.message).join('\n  '));
    }
    console.log(`  wrote schema.graphql (${(sdl.length / 1024).toFixed(0)} KB, validates)`);
  } catch (error) {
    console.error('  schema.graphql FAILED to build:', (error as Error).message);
    process.exitCode = 1;
  }
  for (const warning of warnings) console.warn(`    ${warning}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
