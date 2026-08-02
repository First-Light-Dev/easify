/**
 * Generates TypeScript types under src/shiphero/generated from the ShipHero
 * GraphQL schema reference published at https://developer.shiphero.com/schema/.
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
 * Object fields are emitted as optional because a GraphQL response only carries
 * the fields named in the selection set. Input fields keep the nullability the
 * schema declares.
 */

import * as fs from 'fs';
import * as graphql from 'graphql';
import * as path from 'path';
import * as prettier from 'prettier';

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

/**
 * GraphQL scalars are inlined as primitives rather than aliased so generated
 * names never shadow globals such as `Date` or `BigInt`.
 */
const SCALAR_TS: Record<string, string> = {
  String: 'string',
  ID: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  BigInt: 'number',
  Decimal: 'string',
  Date: 'string',
  DateTime: 'string',
  ISODateTime: 'string',
  Time: 'string',
  JSONString: 'string',
  UUID: 'string',
  Upload: 'unknown',
  GenericScalar: 'unknown',
  Money: 'string',
  URL: 'string',
  JSONObjectScalar: 'Record<string, unknown>'
};

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
// TypeScript rendering
// ---------------------------------------------------------------------------

const unknownScalars = new Set<string>();

/** Converts a GraphQL type reference into a TypeScript type expression. */
function tsType(graphqlType: string, known: Map<string, TypeDef>): string {
  const nonNull = graphqlType.endsWith('!');
  const inner = nonNull ? graphqlType.slice(0, -1) : graphqlType;

  if (inner.startsWith('[') && inner.endsWith(']')) {
    const element = tsType(inner.slice(1, -1), known);
    const wrapped = /[|&]/.test(element) ? `(${element})` : element;
    return `${wrapped}[]`;
  }

  const def = known.get(inner);
  if (def && def.kind === 'scalar')
    return SCALAR_TS[inner] ?? (unknownScalars.add(inner), 'unknown');
  if (!def && SCALAR_TS[inner]) return SCALAR_TS[inner];
  if (!def) {
    if (!SCALAR_TS[inner]) unknownScalars.add(inner);
    return 'unknown';
  }
  return inner;
}

/** `true` when a nullable GraphQL type should also admit `null` in TypeScript. */
function nullable(graphqlType: string): boolean {
  return !graphqlType.endsWith('!');
}

function docComment(lines: (string | undefined)[], indent = '  '): string {
  const parts = lines.filter((line): line is string => Boolean(line && line.trim()));
  if (!parts.length) return '';
  if (parts.length === 1 && parts[0].length < 90) return `${indent}/** ${parts[0]} */\n`;
  return [`${indent}/**`, ...parts.map((line) => `${indent} * ${line}`), `${indent} */`, ''].join(
    '\n'
  );
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function renderInterface(def: TypeDef, known: Map<string, TypeDef>, partial: boolean): string {
  const lines: string[] = [];
  lines.push(docComment([def.description, `GraphQL \`${def.kind} ${def.name}\`.`], ''));
  lines.push(`export interface ${def.name} {`);

  if (!def.fields.length) lines.push('  [key: string]: unknown;');

  for (const field of def.fields) {
    const base = tsType(field.type, known);
    // Output fields are always optional: a response only holds what was selected.
    const optional = partial || nullable(field.type);
    const value = nullable(field.type) ? `${base} | null` : base;
    const fieldArgs = field.args?.map((arg) => `${arg.name}: ${arg.type}`).join(', ');
    lines.push(
      docComment([
        field.description,
        field.deprecated ? `@deprecated ${field.deprecated}` : undefined,
        `GraphQL type: \`${field.type}\``,
        fieldArgs ? `Accepts arguments: \`${fieldArgs}\`` : undefined
      ])
    );
    lines.push(`  ${propertyName(field.name)}${optional ? '?' : ''}: ${value};`);
  }

  lines.push('}');
  return lines.join('\n');
}

function renderEnum(def: TypeDef): string {
  const values = def.enumValues.length
    ? def.enumValues.map((value) => `  | '${value.name}'`).join('\n')
    : '  | string';
  return [
    docComment([def.description, `GraphQL \`enum ${def.name}\`.`], ''),
    `export type ${def.name} =`,
    values + ';'
  ].join('\n');
}

function renderUnion(def: TypeDef): string {
  const members = def.possibleTypes.length ? def.possibleTypes.join(' | ') : 'unknown';
  return [
    docComment([def.description, `GraphQL \`union ${def.name}\`.`], ''),
    `export type ${def.name} = ${members};`
  ].join('\n');
}

function pascalCase(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function argsInterfaceName(op: OperationDef): string {
  return `${pascalCase(op.name)}${op.kind === 'query' ? 'Query' : 'Mutation'}Args`;
}

function renderOperationArgs(op: OperationDef, known: Map<string, TypeDef>): string {
  const lines: string[] = [];
  lines.push(
    docComment(
      [op.description, `Arguments for the \`${op.name}\` ${op.kind}.`].filter(Boolean) as string[],
      ''
    )
  );
  lines.push(`export interface ${argsInterfaceName(op)} {`);

  if (!op.args.length) lines.push('  [key: string]: never;');

  for (const arg of op.args) {
    const base = tsType(arg.type, known);
    const value = nullable(arg.type) ? `${base} | null` : base;
    lines.push(
      docComment([
        arg.description,
        arg.default ? `@default ${arg.default}` : undefined,
        `GraphQL type: \`${arg.type}\``
      ])
    );
    lines.push(`  ${propertyName(arg.name)}${arg.required ? '' : '?'}: ${value};`);
  }

  lines.push('}');
  return lines.join('\n');
}

const HEADER = [
  '// Generated by src/scripts/shiphero-codegen.ts from the ShipHero GraphQL schema',
  '// reference (https://developer.shiphero.com/schema/).',
  '// Run `yarn codegen:shiphero` to regenerate. Do not edit by hand.',
  ''
].join('\n');

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
  const prettierOptions = await prettier.resolveConfig(OUT_DIR);
  const format = (contents: string) =>
    prettier.format(contents, { ...prettierOptions, parser: 'typescript' });

  // scalars.ts — documents how each custom scalar is represented.
  const scalarRows = scalars
    .map((def) => `  ${propertyName(def.name)}: ${SCALAR_TS[def.name] ?? 'unknown'};`)
    .join('\n');
  fs.writeFileSync(
    path.join(OUT_DIR, 'scalars.ts'),
    format(
      [
        HEADER,
        '/**',
        ' * How ShipHero custom scalars are represented in TypeScript. Scalars are inlined',
        ' * at each use site; this map is exported for reference only.',
        ' */',
        'export interface ShipHeroScalars {',
        '  String: string;',
        '  ID: string;',
        '  Int: number;',
        '  Float: number;',
        '  Boolean: boolean;',
        scalarRows,
        '}',
        ''
      ].join('\n')
    )
  );
  console.log('  wrote scalars.ts');

  fs.writeFileSync(
    path.join(OUT_DIR, 'enums.ts'),
    format([HEADER, ...enums.map(renderEnum), ''].join('\n\n'))
  );
  console.log(`  wrote enums.ts (${enums.length} enums)`);

  const objectImports = enums.length
    ? `import type { ${enums.map((e) => e.name).join(', ')} } from './enums';`
    : '';
  fs.writeFileSync(
    path.join(OUT_DIR, 'objects.ts'),
    format(
      [
        HEADER,
        objectImports,
        ...unions.map(renderUnion),
        ...objects.map((def) => renderInterface(def, types, true)),
        ''
      ].join('\n\n')
    )
  );
  console.log(`  wrote objects.ts (${objects.length + unions.length} types)`);

  fs.writeFileSync(
    path.join(OUT_DIR, 'inputs.ts'),
    format(
      [HEADER, objectImports, ...inputs.map((def) => renderInterface(def, types, false)), ''].join(
        '\n\n'
      )
    )
  );
  console.log(`  wrote inputs.ts (${inputs.length} inputs)`);

  // operations.ts — argument interfaces plus name -> args/result lookup maps.
  const queries = operations
    .filter((op) => op.kind === 'query')
    .sort((a, b) => a.name.localeCompare(b.name));
  const mutations = operations
    .filter((op) => op.kind === 'mutation')
    .sort((a, b) => a.name.localeCompare(b.name));

  const referenced = new Set<string>();
  for (const op of operations) {
    for (const arg of op.args) {
      const bare = arg.type.replace(/[[\]!]/g, '');
      if (types.has(bare) && types.get(bare)!.kind === 'enum') referenced.add(bare);
      if (types.has(bare) && types.get(bare)!.kind === 'input') referenced.add(bare);
    }
    if (op.returnType && types.has(op.returnType)) referenced.add(op.returnType);
  }

  const enumNames = new Set(enums.map((def) => def.name));
  const inputNames = new Set(inputs.map((def) => def.name));
  const fromEnums = [...referenced].filter((name) => enumNames.has(name)).sort();
  const fromInputs = [...referenced].filter((name) => inputNames.has(name)).sort();
  const fromObjects = [...referenced]
    .filter((name) => !enumNames.has(name) && !inputNames.has(name))
    .sort();

  const resultEntry = (op: OperationDef) =>
    `  ${propertyName(op.name)}: ${
      op.returnType && fromObjects.includes(op.returnType) ? op.returnType : 'unknown'
    };`;

  fs.writeFileSync(
    path.join(OUT_DIR, 'operations.ts'),
    format(
      [
        HEADER,
        fromEnums.length ? `import type { ${fromEnums.join(', ')} } from './enums';` : '',
        fromInputs.length ? `import type { ${fromInputs.join(', ')} } from './inputs';` : '',
        fromObjects.length ? `import type { ${fromObjects.join(', ')} } from './objects';` : '',
        ...queries.map((op) => renderOperationArgs(op, types)),
        ...mutations.map((op) => renderOperationArgs(op, types)),
        '/** Argument type for every documented ShipHero query, keyed by operation name. */',
        'export interface ShipHeroQueryArgs {',
        ...queries.map((op) => `  ${propertyName(op.name)}: ${argsInterfaceName(op)};`),
        '}',
        '/** Result type for every documented ShipHero query, keyed by operation name. */',
        'export interface ShipHeroQueryResults {',
        ...queries.map(resultEntry),
        '}',
        '/** Argument type for every documented ShipHero mutation, keyed by operation name. */',
        'export interface ShipHeroMutationArgs {',
        ...mutations.map((op) => `  ${propertyName(op.name)}: ${argsInterfaceName(op)};`),
        '}',
        '/** Result type for every documented ShipHero mutation, keyed by operation name. */',
        'export interface ShipHeroMutationResults {',
        ...mutations.map(resultEntry),
        '}',
        'export type ShipHeroQueryName = keyof ShipHeroQueryArgs;',
        'export type ShipHeroMutationName = keyof ShipHeroMutationArgs;',
        ''
      ].join('\n\n')
    )
  );
  console.log(`  wrote operations.ts (${queries.length} queries, ${mutations.length} mutations)`);

  // metadata.ts — runtime description of each operation, used to build documents.
  const metadata = (op: OperationDef) => {
    const argTypes = Object.fromEntries(op.args.map((arg) => [arg.name, arg.type]));
    const result = op.returnType ? types.get(op.returnType) : undefined;
    // Most operations wrap their payload in a BaseResponse alongside request_id and
    // complexity; a few (user_quota, uuid) return the payload object directly.
    const wrapped = (result?.fields ?? []).some((field) => field.name === 'request_id');
    const payload = (result?.fields ?? []).filter(
      (field) => field.name !== 'request_id' && field.name !== 'complexity'
    );
    const data = wrapped ? payload.find((field) => field.name === 'data') ?? payload[0] : undefined;
    const bare = data ? data.type.replace(/[[\]!]/g, '') : op.returnType;

    // 3PL users scope an operation with customer_account_id, which sits either on the
    // operation itself (queries) or inside its input object (mutations).
    const dataInput = types.get((argTypes.data ?? '').replace(/[[\]!]/g, ''));
    const customerAccountId = argTypes.customer_account_id
      ? 'arg'
      : dataInput?.fields.some((field) => field.name === 'customer_account_id')
      ? 'data'
      : undefined;

    return {
      name: op.name,
      argTypes,
      returnType: op.returnType,
      /** Field on the result that carries the payload, e.g. `data` or `purchase_order`. */
      payloadField: data?.name,
      payloadType: bare,
      paginated: Boolean(bare?.endsWith('Connection')),
      payloadArgTypes: Object.fromEntries((data?.args ?? []).map((arg) => [arg.name, arg.type])),
      customerAccountId
    };
  };

  const renderMetadata = (name: string, ops: OperationDef[]) =>
    [
      `export const ${name}: Record<string, ShipHeroOperationMeta> = ${JSON.stringify(
        Object.fromEntries(ops.map((op) => [op.name, metadata(op)])),
        null,
        2
      )};`
    ].join('\n');

  fs.writeFileSync(
    path.join(OUT_DIR, 'metadata.ts'),
    format(
      [
        HEADER,
        '/** Runtime description of a ShipHero operation, used to build GraphQL documents. */',
        'export interface ShipHeroOperationMeta {',
        '  name: string;',
        '  /** Argument name to GraphQL type, e.g. `{ sku: "String" }`. */',
        '  argTypes: Record<string, string>;',
        '  returnType?: string;',
        '  /** Result field carrying the payload, e.g. `data` or `purchase_order`. */',
        '  payloadField?: string;',
        '  payloadType?: string;',
        '  /** True when the payload is a Relay connection and needs pagination arguments. */',
        '  paginated: boolean;',
        '  /** Arguments the payload field accepts, e.g. `{ first: "Int", after: "String" }`. */',
        '  payloadArgTypes: Record<string, string>;',
        '  /**',
        '   * Where a 3PL passes `customer_account_id`: as an operation argument, as a field',
        '   * of the `data` input, or nowhere because the operation does not support it.',
        '   */',
        "  customerAccountId?: 'arg' | 'data';",
        '}',
        renderMetadata('SHIPHERO_QUERIES', queries),
        renderMetadata('SHIPHERO_MUTATIONS', mutations),
        ''
      ].join('\n\n')
    )
  );
  console.log('  wrote metadata.ts');

  // schema.graphql — the SDL consumers point graphql-codegen at. ShipHero exposes
  // no introspection endpoint, so this file is the only machine-readable schema.
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

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.ts'),
    format(
      [
        HEADER,
        "export * from './scalars';",
        "export * from './enums';",
        "export * from './objects';",
        "export * from './inputs';",
        "export * from './operations';",
        "export * from './metadata';",
        ''
      ].join('\n')
    )
  );
  console.log('  wrote index.ts');

  if (unknownScalars.size) {
    console.warn(`Unmapped scalars (emitted as unknown): ${[...unknownScalars].sort().join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
