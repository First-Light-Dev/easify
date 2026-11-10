/**
 * Generates the Zod schemas under src/cin7-omni/resources/types from the OpenAPI
 * spec that Cin7 publishes at https://api.cin7.com/api/OpenApi/GetSpec.
 *
 * Usage:
 *   ts-node src/scripts/cin7-omni-codegen.ts [--spec <path-or-url>]
 *
 * The spec declares properties in PascalCase, but the API serialises responses with
 * Newtonsoft's camel case resolver, so property names are converted with the same
 * algorithm Newtonsoft uses (see toCamelCase).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as prettier from 'prettier';

const DEFAULT_SPEC_URL = 'https://api.cin7.com/api/OpenApi/GetSpec';
const OUT_DIR = path.join(__dirname, '..', 'cin7-omni', 'resources', 'types');

interface SpecSchema {
  type?: string;
  format?: string;
  description?: string | null;
  enum?: string[];
  items?: SpecSchema;
  properties?: Record<string, SpecSchema>;
  maximum?: number;
}

interface Spec {
  paths: Record<string, Record<string, any>>;
}

type EntitySource = 'response' | 'request';

interface EntityConfig {
  /** Base name of the generated schema, e.g. `SalesOrder` -> `SalesOrderSchema`. */
  name: string;
  path: string;
  method: 'get' | 'post' | 'put' | 'delete';
  source: EntitySource;
  description?: string;
}

interface FileConfig {
  file: string;
  description: string;
  entities: EntityConfig[];
}

/**
 * Places where the published spec does not describe what the API actually returns. Each entry
 * replaces the generated expression for a property of that name, wherever it appears.
 */
const PROPERTY_OVERRIDES: Record<string, { expression: string; note: string }> = {
  CustomFields: {
    expression: 'z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])',
    note: 'The spec reflects this as an array of strings, but the API returns custom fields keyed by name. Both shapes are accepted.'
  }
};

/**
 * Mirrors Newtonsoft.Json's StringUtils.ToCamelCase, which lowercases a leading run of
 * capitals rather than just the first character: `SSCCNumber` becomes `ssccNumber` and
 * `ModifiedCOGSDate` becomes `modifiedCOGSDate`.
 */
function toCamelCase(value: string): string {
  if (!value || !/^[A-Z]/.test(value)) return value;

  const chars = value.split('');
  for (let i = 0; i < chars.length; i++) {
    if (i === 1 && !/[A-Z]/.test(chars[i])) break;

    const hasNext = i + 1 < chars.length;
    if (i > 0 && hasNext && !/[A-Z]/.test(chars[i + 1])) break;

    chars[i] = chars[i].toLowerCase();
  }
  return chars.join('');
}

function pascalCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function singularize(value: string): string {
  if (/ies$/.test(value)) return `${value.slice(0, -3)}y`;
  if (/ses$/.test(value)) return value.slice(0, -2);
  if (/[^s]s$/.test(value)) return value.slice(0, -1);
  return value;
}

/** Strips the zero-width characters and CRLF sequences the spec descriptions are littered with. */
function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\*\//g, '*\u200B/')
    .trim();
}

function renderDoc(schema: SpecSchema, indent: string): string {
  const notes: string[] = [];

  const description = cleanText(schema.description);
  if (description) notes.push(description);
  if (schema.format === 'date-time') notes.push('Format: UTC date-time (yyyy-MM-ddTHH:mm:ssZ).');
  if (typeof schema.maximum === 'number') notes.push(`Max length: ${schema.maximum}.`);
  if (schema.enum?.length) {
    // Typed as a plain string rather than a union: the API does not always echo the casing
    // the spec documents (a sales order `status` of "Draft" comes back as "DRAFT").
    notes.push(`Documented values: ${schema.enum.join(', ')}.`);
  }

  if (!notes.length) return '';

  const lines = notes.join(' ').match(/.{1,88}(\s|$)/g) ?? [notes.join(' ')];
  const body = lines.map((line) => `${indent} * ${line.trim()}`).join('\n');
  return `${indent}/**\n${body}\n${indent} */\n`;
}

class SchemaEmitter {
  private declarations: string[] = [];
  private namesByBody = new Map<string, string>();
  private usedNames = new Set<string>();

  /** Declares a named object schema, reusing an existing declaration when the body matches. */
  declare(preferredName: string, body: string): string {
    const existing = this.namesByBody.get(body);
    if (existing) return existing;

    let name = preferredName;
    let suffix = 2;
    while (this.usedNames.has(name)) name = `${preferredName}${suffix++}`;

    this.usedNames.add(name);
    this.namesByBody.set(body, name);
    this.declarations.push(
      `export const ${name}Schema = ${body};\n\nexport type ${name} = z.infer<typeof ${name}Schema>;`
    );
    return name;
  }

  reserve(name: string, body: string): void {
    this.usedNames.add(name);
    if (!this.namesByBody.has(body)) this.namesByBody.set(body, name);
  }

  lookup(body: string): string | undefined {
    return this.namesByBody.get(body);
  }

  render(): string {
    return this.declarations.join('\n\n');
  }
}

function zodExpression(
  schema: SpecSchema | undefined,
  nameHint: string,
  emitter: SchemaEmitter
): string {
  if (!schema) return 'z.unknown()';

  // The type discriminates first: the spec attaches bogus `properties` (Chars/Length) to
  // string members, an artifact of reflecting over .NET's System.String.
  switch (schema.type) {
    case 'string':
      return 'z.string()';
    case 'integer':
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'array':
      return `z.array(${zodExpression(schema.items, singularize(nameHint), emitter)})`;
    case 'object': {
      if (!schema.properties || !Object.keys(schema.properties).length) {
        return 'z.record(z.string(), z.unknown())';
      }
      return `${emitter.declare(nameHint, renderObject(schema, nameHint, emitter))}Schema`;
    }
    default:
      return 'z.unknown()';
  }
}

/**
 * Every field is nullable and optional: the API nulls out unset fields, and the `fields`
 * query parameter lets callers request a subset of them.
 */
function renderObject(schema: SpecSchema, nameHint: string, emitter: SchemaEmitter): string {
  const properties = schema.properties ?? {};
  const lines = Object.entries(properties).map(([rawName, propSchema]) => {
    const override = PROPERTY_OVERRIDES[rawName];
    const expression = override
      ? override.expression
      : zodExpression(propSchema, `${nameHint}${pascalCase(rawName)}`, emitter);
    const documented = override
      ? {
          ...propSchema,
          description: `${cleanText(propSchema.description)} ${override.note}`.trim()
        }
      : propSchema;
    return `${renderDoc(documented, '  ')}  ${toCamelCase(
      rawName
    )}: ${expression}.nullable().optional()`;
  });

  return `z.looseObject({\n${lines.join(',\n')}\n})`;
}

function unwrapCollection(schema: SpecSchema | undefined): SpecSchema | undefined {
  if (schema?.type === 'array') return schema.items;
  return schema;
}

function resolveEntitySchema(spec: Spec, entity: EntityConfig): SpecSchema {
  const operation = spec.paths[entity.path]?.[entity.method];
  if (!operation)
    throw new Error(`Missing operation ${entity.method.toUpperCase()} ${entity.path}`);

  const container =
    entity.source === 'request'
      ? operation.requestBody?.content
      : operation.responses?.['200']?.content;
  if (!container) {
    throw new Error(
      `Missing ${entity.source} body for ${entity.method.toUpperCase()} ${entity.path}`
    );
  }

  const mediaType = Object.values(container)[0] as { schema?: SpecSchema } | undefined;
  const schema = unwrapCollection(mediaType?.schema);
  if (!schema?.properties) {
    throw new Error(
      `Unexpected ${entity.source} schema for ${entity.method.toUpperCase()} ${entity.path}`
    );
  }
  return schema;
}

function generateFile(spec: Spec, config: FileConfig): string {
  const emitter = new SchemaEmitter();
  const topLevel: { name: string; body: string; entity: EntityConfig }[] = [];

  for (const entity of config.entities) {
    const schema = resolveEntitySchema(spec, entity);
    const body = renderObject(schema, entity.name, emitter);
    emitter.reserve(entity.name, body);
    topLevel.push({ name: entity.name, body, entity });
  }

  const rendered: string[] = [];
  const bodies = new Map<string, string>();

  for (const { name, body, entity } of topLevel) {
    const doc = entity.description ? `/**\n * ${entity.description}\n */\n` : '';
    const alias = bodies.get(body);

    if (alias) {
      rendered.push(
        `${doc}export const ${name}Schema = ${alias}Schema;\n\nexport type ${name} = z.infer<typeof ${name}Schema>;`
      );
      continue;
    }

    bodies.set(body, name);
    rendered.push(
      `${doc}export const ${name}Schema = ${body};\n\nexport type ${name} = z.infer<typeof ${name}Schema>;`
    );
  }

  const nested = emitter.render();
  const header = [
    '// Generated by src/scripts/cin7-omni-codegen.ts from the Cin7 Omni OpenAPI spec.',
    '// Run `yarn codegen:cin7-omni` to regenerate. Do not edit by hand.',
    '',
    `import { z } from 'zod';`,
    '',
    `/**`,
    ` * ${config.description}`,
    ` */`
  ].join('\n');

  return [header, nested, rendered.join('\n\n')].filter(Boolean).join('\n\n') + '\n';
}

const FILES: FileConfig[] = [
  {
    file: 'Adjustments',
    description: 'Stock adjustments. https://api.cin7.com/api/Help#Adjustments',
    entities: [
      { name: 'Adjustment', path: '/api/v1/Adjustments', method: 'get', source: 'response' },
      { name: 'AdjustmentCreate', path: '/api/v1/Adjustments', method: 'post', source: 'request' },
      { name: 'AdjustmentUpdate', path: '/api/v1/Adjustments', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'BomMasters',
    description: 'Bill of materials masters. https://api.cin7.com/api/Help#BomMasters',
    entities: [
      { name: 'BomMaster', path: '/api/v1/BomMasters', method: 'get', source: 'response' },
      {
        name: 'BomMasterV2',
        path: '/api/v2/BomMasters',
        method: 'get',
        source: 'response',
        description: 'The v2 representation of a BOM master.'
      }
    ]
  },
  {
    file: 'Branches',
    description: 'Branches. https://api.cin7.com/api/Help#Branches',
    entities: [
      { name: 'Branch', path: '/api/v1/Branches', method: 'get', source: 'response' },
      { name: 'BranchCreate', path: '/api/v1/Branches', method: 'post', source: 'request' },
      { name: 'BranchUpdate', path: '/api/v1/Branches', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'BranchTransfers',
    description: 'Branch transfers. https://api.cin7.com/api/Help#BranchTransfers',
    entities: [
      {
        name: 'BranchTransfer',
        path: '/api/v1/BranchTransfers',
        method: 'get',
        source: 'response'
      },
      {
        name: 'BranchTransferCreate',
        path: '/api/v1/BranchTransfers',
        method: 'post',
        source: 'request'
      },
      {
        name: 'BranchTransferUpdate',
        path: '/api/v1/BranchTransfers',
        method: 'put',
        source: 'request'
      }
    ]
  },
  {
    file: 'Cartons',
    description: 'Sales order cartons. https://api.cin7.com/api/Help#Cartons',
    entities: [
      { name: 'Carton', path: '/api/v1/Cartons/{id}', method: 'get', source: 'response' },
      { name: 'CartonUpdate', path: '/api/v1/Cartons/{id}', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'Contacts',
    description: 'CRM contacts. https://api.cin7.com/api/Help#Contacts',
    entities: [
      { name: 'Contact', path: '/api/v1/Contacts', method: 'get', source: 'response' },
      { name: 'ContactCreate', path: '/api/v1/Contacts', method: 'post', source: 'request' },
      { name: 'ContactUpdate', path: '/api/v1/Contacts', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'CreditNotes',
    description: 'Credit notes. https://api.cin7.com/api/Help#CreditNotes',
    entities: [
      { name: 'CreditNote', path: '/api/v1/CreditNotes', method: 'get', source: 'response' },
      { name: 'CreditNoteCreate', path: '/api/v1/CreditNotes', method: 'post', source: 'request' },
      { name: 'CreditNoteUpdate', path: '/api/v1/CreditNotes', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'FeesAndPayouts',
    description: 'Cin7 Pay fees and payouts. https://api.cin7.com/api/Help#FeesAndPayouts',
    entities: [
      {
        name: 'PaymentFee',
        path: '/api/v1/PaymentFeesAndPayouts/Fees',
        method: 'get',
        source: 'response'
      },
      {
        name: 'PaymentPayout',
        path: '/api/v1/PaymentFeesAndPayouts/Payouts',
        method: 'get',
        source: 'response'
      }
    ]
  },
  {
    file: 'Payments',
    description: 'Payments. https://api.cin7.com/api/Help#Payments',
    entities: [
      { name: 'Payment', path: '/api/v1/Payments', method: 'get', source: 'response' },
      { name: 'PaymentCreate', path: '/api/v1/Payments', method: 'post', source: 'request' },
      { name: 'PaymentUpdate', path: '/api/v1/Payments', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'ProductCategories',
    description: 'Product categories. https://api.cin7.com/api/Help#ProductCategories',
    entities: [
      {
        name: 'ProductCategory',
        path: '/api/v1/ProductCategories',
        method: 'get',
        source: 'response'
      },
      {
        name: 'ProductCategoryCreate',
        path: '/api/v1/ProductCategories',
        method: 'post',
        source: 'request'
      },
      {
        name: 'ProductCategoryUpdate',
        path: '/api/v1/ProductCategories',
        method: 'put',
        source: 'request'
      }
    ]
  },
  {
    file: 'ProductionJobs',
    description: 'Production jobs. https://api.cin7.com/api/Help#ProductionJobs',
    entities: [
      { name: 'ProductionJob', path: '/api/v1/ProductionJobs', method: 'get', source: 'response' },
      {
        name: 'ProductionJobCreate',
        path: '/api/v1/ProductionJobs',
        method: 'post',
        source: 'request'
      },
      {
        name: 'ProductionJobUpdate',
        path: '/api/v1/ProductionJobs',
        method: 'put',
        source: 'request'
      }
    ]
  },
  {
    file: 'ProductOptions',
    description: 'Product options. https://api.cin7.com/api/Help#ProductOptions',
    entities: [
      { name: 'ProductOption', path: '/api/v1/ProductOptions', method: 'get', source: 'response' },
      {
        name: 'ProductOptionCreate',
        path: '/api/v1/ProductOptions',
        method: 'post',
        source: 'request'
      },
      {
        name: 'ProductOptionUpdate',
        path: '/api/v1/ProductOptions',
        method: 'put',
        source: 'request'
      }
    ]
  },
  {
    file: 'Products',
    description: 'Products. https://api.cin7.com/api/Help#Products',
    entities: [
      { name: 'Product', path: '/api/v1/Products', method: 'get', source: 'response' },
      { name: 'ProductCreate', path: '/api/v1/Products', method: 'post', source: 'request' },
      { name: 'ProductUpdate', path: '/api/v1/Products', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'PurchaseOrders',
    description: 'Purchase orders. https://api.cin7.com/api/Help#PurchaseOrders',
    entities: [
      { name: 'PurchaseOrder', path: '/api/v1/PurchaseOrders', method: 'get', source: 'response' },
      {
        name: 'PurchaseOrderCreate',
        path: '/api/v1/PurchaseOrders',
        method: 'post',
        source: 'request'
      },
      {
        name: 'PurchaseOrderUpdate',
        path: '/api/v1/PurchaseOrders',
        method: 'put',
        source: 'request'
      }
    ]
  },
  {
    file: 'Quotes',
    description: 'Quotes. https://api.cin7.com/api/Help#Quotes',
    entities: [
      { name: 'Quote', path: '/api/v1/Quotes', method: 'get', source: 'response' },
      { name: 'QuoteCreate', path: '/api/v1/Quotes', method: 'post', source: 'request' },
      { name: 'QuoteUpdate', path: '/api/v1/Quotes', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'SalesOrders',
    description: 'Sales orders. https://api.cin7.com/api/Help#SalesOrders',
    entities: [
      { name: 'SalesOrder', path: '/api/v1/SalesOrders', method: 'get', source: 'response' },
      { name: 'SalesOrderCreate', path: '/api/v1/SalesOrders', method: 'post', source: 'request' },
      { name: 'SalesOrderUpdate', path: '/api/v1/SalesOrders', method: 'put', source: 'request' }
    ]
  },
  {
    file: 'SalesOrdersWithCartons',
    description:
      'Sales orders including carton details. https://api.cin7.com/api/Help#SalesOrdersWithCartons',
    entities: [
      {
        name: 'SalesOrderWithCartons',
        path: '/api/v1/SalesOrdersWithCartons',
        method: 'get',
        source: 'response'
      }
    ]
  },
  {
    file: 'SerialNumbers',
    description: 'Serial numbers. https://api.cin7.com/api/Help#SerialNumbers',
    entities: [
      { name: 'SerialNumber', path: '/api/v1/SerialNumbers', method: 'get', source: 'response' }
    ]
  },
  {
    file: 'SizeRanges',
    description: 'Size ranges. https://api.cin7.com/api/Help#SizeRanges',
    entities: [{ name: 'SizeRange', path: '/api/v1/SizeRanges', method: 'get', source: 'response' }]
  },
  {
    file: 'Stock',
    description: 'Stock levels. https://api.cin7.com/api/Help#Stock',
    entities: [{ name: 'Stock', path: '/api/v1/Stock', method: 'get', source: 'response' }]
  },
  {
    file: 'Users',
    description: 'Users. https://api.cin7.com/api/Help#Users',
    entities: [{ name: 'User', path: '/api/v1/Users', method: 'get', source: 'response' }]
  },
  {
    file: 'Vouchers',
    description: 'Vouchers. https://api.cin7.com/api/Help#Voucher',
    entities: [{ name: 'Voucher', path: '/api/v1/Voucher', method: 'get', source: 'response' }]
  }
];

const COMMON: FileConfig = {
  file: 'Common',
  description: 'Response envelopes shared by every Cin7 Omni endpoint.',
  entities: [
    {
      name: 'UpsertResult',
      path: '/api/v1/SalesOrders',
      method: 'post',
      source: 'response',
      description: 'The per-record result Cin7 returns for each item in a POST or PUT batch.'
    },
    {
      name: 'DeleteResult',
      path: '/api/v1/Payments/{id}',
      method: 'delete',
      source: 'response',
      description: 'The result Cin7 returns when a record is deleted.'
    },
    {
      name: 'ImageUploadResult',
      path: '/api/v1/ProductImages',
      method: 'post',
      source: 'response',
      description: 'The result Cin7 returns when a product image is uploaded.'
    }
  ]
};

async function loadSpec(source: string): Promise<Spec> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to download spec: ${response.status}`);
    return (await response.json()) as Spec;
  }
  return JSON.parse(fs.readFileSync(source, 'utf8')) as Spec;
}

async function main(): Promise<void> {
  const specArgIndex = process.argv.indexOf('--spec');
  const source = specArgIndex === -1 ? DEFAULT_SPEC_URL : process.argv[specArgIndex + 1];

  console.log(`Reading Cin7 Omni OpenAPI spec from ${source}`);
  const spec = await loadSpec(source);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Formatting here keeps regeneration idempotent, rather than leaving the output to drift
  // until someone runs `yarn format`.
  const prettierOptions = await prettier.resolveConfig(OUT_DIR);
  const format = (contents: string) =>
    prettier.format(contents, { ...prettierOptions, parser: 'typescript' });

  const configs = [COMMON, ...FILES];
  for (const config of configs) {
    const contents = format(generateFile(spec, config));
    fs.writeFileSync(path.join(OUT_DIR, `${config.file}.ts`), contents);
    console.log(`  wrote ${config.file}.ts`);
  }

  const index = [
    '// Generated by src/scripts/cin7-omni-codegen.ts from the Cin7 Omni OpenAPI spec.',
    '// Run `yarn codegen:cin7-omni` to regenerate. Do not edit by hand.',
    '',
    ...configs.map((config) => `export * from './${config.file}';`),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), index);
  console.log(`  wrote index.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
