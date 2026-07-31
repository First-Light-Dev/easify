/**
 * Generates Zod schemas under src/cin7-core/resources/types from the Cin7 Core
 * (DEAR Inventory) API Blueprint published at Apiary.
 *
 * Usage:
 *   ts-node src/scripts/cin7-core-codegen.ts [--spec <path-or-url>]
 *
 * Cin7 Core serialises JSON with PascalCase property names, so generated schemas
 * keep that casing (matching the live API and the published docs).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as prettier from 'prettier';

const DEFAULT_SPEC_URL = 'https://jsapi.apiary.io/apis/dearinventory.apib';
const OUT_DIR = path.join(__dirname, '..', 'cin7-core', 'resources', 'types');

/**
 * Type files maintained by hand and re-exported from the generated index. The blueprint
 * reuses the simple-purchase table titles for the advanced-purchase endpoints, so those
 * models cannot be generated unambiguously.
 */
const HAND_WRITTEN_TYPE_FILES = ['AdvancedPurchases'];

interface FieldDef {
  prop: string;
  typeRaw: string;
  length: string;
  required: string;
  notes: string;
  ref?: string;
  isArray?: boolean;
}

interface ModelDef {
  name: string;
  fields: FieldDef[];
  description?: string;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\*\//g, '*\u200B/')
    .trim();
}

function toIdent(name: string): string {
  const cleaned = cleanText(name)
    .replace(/Model$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return 'Unknown';
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function isSkippableModelName(name: string): boolean {
  return /^(POST|PUT|DELETE|GET|Available)(Method|Methods|Fields)?$/i.test(name);
}

function parseTypeCell(typeRaw: string): { base: string; ref?: string; isArray: boolean } {
  const cleaned = cleanText(typeRaw);
  const href = typeRaw.match(/href="#([^"]+)"/i)?.[1];
  const isArray = /\[\]|\bArray\b/i.test(typeRaw) || /\[\]/.test(cleaned);
  if (href) return { base: 'ref', ref: toIdent(href), isArray };
  return { base: cleaned, isArray };
}

function mapScalar(typeRaw: string): string {
  const t = cleanText(typeRaw).toLowerCase();
  if (!t) return 'z.unknown()';
  if (/guid|uuid/.test(t)) return 'z.string()';
  if (/bool/.test(t)) return 'z.boolean()';
  if (/date|time/.test(t)) return 'z.string()';
  if (/int|short|decimal|money|number|float|double/.test(t)) return 'z.number()';
  if (/string/.test(t)) return 'z.string()';
  if (/^array/.test(t)) return 'z.array(z.unknown())';
  return 'z.unknown()';
}

function parseModels(text: string): Map<string, ModelDef> {
  const lines = text.split(/\r?\n/);
  const models = new Map<string, ModelDef>();
  let lastAnchor: string | null = null;
  let lastResourceHeading: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const anchor = line.match(/<a name="([^"]+)"/i);
    if (anchor) lastAnchor = anchor[1];

    const resourceHeading = line.match(/^## (.+?)(?:\s+\[\/|$)/);
    if (resourceHeading) {
      lastResourceHeading = cleanText(resourceHeading[1]);
      // A new resource section invalidates status-table anchors sitting above it.
      lastAnchor = null;
    }

    // Skip status / enum tables — they share the markdown table shape but aren't models.
    if (/^### Available .+ Statuses/i.test(line) || /^### Available .+ Values/i.test(line)) {
      i++;
      continue;
    }

    const available = line.match(/^### Available [Ff]ields(?: for)?\s*(.*)$/);
    // Some sections flip the wording, e.g. "### Invoice Available Fields".
    const availableAlt = line.match(/^### (.+?) Available [Ff]ields\s*$/);
    const partialModel = line.match(/^### (.+ Model)\s*$/);
    if (!available && !availableAlt && !partialModel) {
      i++;
      continue;
    }

    const title = cleanText(
      (available?.[1] || availableAlt?.[1] || partialModel?.[1] || '').replace(/<[^>]+>/g, '')
    );
    let j = i + 1;
    while (j < lines.length && !/^\|/.test(lines[j])) {
      if (/^#{1,3} /.test(lines[j]) || /^\+ /.test(lines[j])) break;
      j++;
    }
    if (j >= lines.length || !/^\|/.test(lines[j])) {
      i++;
      continue;
    }

    j++;
    if (j < lines.length && /^\|\s*:?-{3,}/.test(lines[j])) j++;

    const fields: FieldDef[] = [];
    while (j < lines.length && /^\|/.test(lines[j])) {
      const parts = lines[j].split('|').slice(1, -1).map((cell) => cell.trim());
      if (parts.length >= 2) {
        const prop = (parts[0].match(/`([^`]+)`/)?.[1] || parts[0]).trim();
        if (prop && !/^property$/i.test(prop)) {
          const parsed = parseTypeCell(parts[1] || '');
          fields.push({
            prop,
            typeRaw: parts[1] || '',
            length: parts[2] || '',
            required: parts[3] || '',
            notes: cleanText(parts[4] || ''),
            ref: parsed.ref,
            isArray: parsed.isArray
          });
        }
      }
      j++;
    }

    if (fields.length) {
      // Prefer the explicit "Available Fields for X" / "X Model" title; fall back to the
      // named anchor only when the title is generic (POST/PUT method).
      let name: string;
      const titled = title ? toIdent(title) : '';
      if (titled && !isSkippableModelName(titled)) {
        name = titled;
      } else if (lastAnchor && /Model$/i.test(lastAnchor)) {
        name = toIdent(lastAnchor);
      } else if (lastResourceHeading) {
        const suffix = /post/i.test(title) ? 'Create' : /put/i.test(title) ? 'Update' : '';
        name = toIdent(`${lastResourceHeading}${suffix}`);
      } else {
        name = toIdent(title || lastAnchor || 'Unknown');
      }

      const existing = models.get(name);
      if (!existing || existing.fields.length < fields.length) {
        models.set(name, {
          name,
          fields,
          description: title || lastResourceHeading || name
        });
      }
      lastAnchor = null;
    }

    i = j;
  }

  return models;
}

function renderDoc(field: FieldDef, indent: string): string {
  const notes: string[] = [];
  if (field.notes) notes.push(field.notes);
  if (field.length && /\d/.test(field.length)) notes.push(`Max length: ${field.length}.`);
  if (field.required && /yes/i.test(field.required)) {
    notes.push(`Required${field.required.includes('*') ? ' (conditional)' : ''}.`);
  }
  if (!notes.length) return '';
  const lines = notes.join(' ').match(/.{1,88}(\s|$)/g) ?? [notes.join(' ')];
  return `${indent}/**\n${lines.map((line) => `${indent} * ${line.trim()}`).join('\n')}\n${indent} */\n`;
}

function zodForField(
  field: FieldDef,
  known: Set<string>,
  localModels: Set<string>,
  currentModel?: string
): string {
  if (field.ref) {
    const refName = field.ref;
    // Self-references and cross-file refs stay loose to avoid TDZ / circular init issues.
    if (refName === currentModel || !localModels.has(refName)) {
      void known;
      return field.isArray ? 'z.array(z.unknown())' : 'z.unknown()';
    }
    const expr = `${refName}Schema`;
    return field.isArray ? `z.array(${expr})` : expr;
  }
  const scalar = mapScalar(field.typeRaw);
  return field.isArray && !scalar.startsWith('z.array') ? `z.array(${scalar})` : scalar;
}

function topologicalOrder(models: Map<string, ModelDef>): string[] {
  const remaining = new Set(models.keys());
  const ordered: string[] = [];

  while (remaining.size) {
    let progressed = false;
    for (const name of [...remaining]) {
      const deps = (models.get(name)?.fields ?? [])
        .map((field) => field.ref)
        .filter((ref): ref is string => !!ref && remaining.has(ref) && ref !== name);
      if (!deps.length) {
        ordered.push(name);
        remaining.delete(name);
        progressed = true;
      }
    }
    if (!progressed) {
      // Break cycles by emitting the rest in alpha order.
      ordered.push(...[...remaining].sort());
      break;
    }
  }
  return ordered;
}

/** Models that form the public surface of the client; nested helpers stay internal. */
const PUBLIC_MODELS = [
  'AttributeSet',
  'BankAccounts',
  'Brand',
  'Carrier',
  'ChartOfAccounts',
  'Customer',
  'CustomerCredits',
  'CustomerDefaultTemplate',
  'Disassembly',
  'DisassemblyList',
  'FinishedGoods',
  'FinishedGoodsList',
  'FixedAssetTypes',
  'InventoryWriteOff',
  'InventoryWriteOffList',
  'Journal',
  'Location',
  'ME',
  'Product',
  'ProductAvailability',
  'ProductCategory',
  'ProductFamily',
  'Purchase',
  'PurchaseCreditNoteList',
  'PurchaseList',
  'Sale',
  'SaleCreditNoteList',
  'SaleList',
  'SaleQuote',
  'SaleOrder',
  'SaleFulfilment',
  'SaleInvoice',
  'SaleCreditNote',
  'SalePaymentLine',
  'StockAdjustment',
  'StockAdjustmentList',
  'StockTake',
  'StockTakeList',
  'StockTransfer',
  'StockTransferList',
  'Supplier',
  'Tax',
  'UnitOfMeasure',
  'Webhook',
  'Lead',
  'Opportunity',
  'PaymentTerm',
  'PriceTier',
  'ProductionOrder',
  'ProductionOrderListItem',
  'ProductDeal',
  'ShippingZone',
  'Transactions',
  'MeAddress',
  'MeContact'
];

const FILE_GROUPS: { file: string; description: string; models: string[] }[] = [
  {
    file: 'Common',
    description: 'Shared envelopes and helpers for the Cin7 Core API.',
    models: []
  },
  {
    file: 'Reference',
    description: 'Reference books (locations, brands, tax, etc.).',
    models: [
      'AttributeSet',
      'AttributeSetLine',
      'BankAccounts',
      'Brand',
      'Carrier',
      'ChartOfAccounts',
      'FixedAssetTypes',
      'Location',
      'PaymentTerm',
      'PriceTier',
      'PriceTiers',
      'Tax',
      'TaxComponent',
      'UnitOfMeasure',
      'ShippingZone',
      'ShipZoneAppliesTo',
      'ShipZoneCondition',
      'ProductDeal',
      'ProductDiscountRule',
      'DiscountLine',
      'MarkupPriceLine'
    ]
  },
  {
    file: 'Customers',
    description: 'Customers. https://dearinventory.docs.apiary.io/#reference/customer',
    models: ['Customer', 'CustomerCredits', 'CustomerDefaultTemplate', 'ChildCustomer', 'Address', 'SupplierContact', 'AdditionalAttribute']
  },
  {
    file: 'Products',
    description: 'Products and availability. https://dearinventory.docs.apiary.io/#reference/product',
    models: [
      'Product',
      'ProductAvailability',
      'ProductCategory',
      'ProductFamily',
      'ProductFamilyProductLine',
      'ProductSupplier',
      'ProductMovement',
      'ProductPrice',
      'ReorderLevel',
      'BillOfMaterialProduct',
      'BillOfMaterialService',
      'AttachmentLine'
    ]
  },
  {
    file: 'Sales',
    description: 'Sales and nested sale documents. https://dearinventory.docs.apiary.io/#reference/sale',
    models: [
      'Sale',
      'SaleList',
      'SaleQuote',
      'SaleQuoteLine',
      'SaleOrder',
      'SaleOrderLine',
      'SaleFulfilment',
      'SaleFulfilmentPickPackLine',
      'SaleFulfilmentShipLine',
      'SaleInvoice',
      'SaleInvoicePartial',
      'SaleInvoiceLine',
      'SaleInvoiceAdditionalCharge',
      'SaleCreditNote',
      'SaleCreditNoteList',
      'SaleCreditNotePartial',
      'SalePaymentLinePartial',
      'SalePaymentLine',
      'SaleAdditionalCharge',
      'SaleFulfilmentPick',
      'SaleFulfilmentPack',
      'SaleFulfilmentShip',
      'SaleManualJournal',
      'SaleManualJournalLine',
      'SaleShippingAddress',
      'SaleTransactionLine'
    ]
  },
  {
    file: 'Purchases',
    description: 'Purchases and nested purchase documents. https://dearinventory.docs.apiary.io/#reference/purchase',
    models: [
      'Purchase',
      'PurchaseList',
      'PurchaseOrder',
      'PurchaseOrderLine',
      'PurchaseStock',
      'PurchaseStockLine',
      'PurchaseInvoice',
      'PurchaseInvoiceLine',
      'PurchaseInvoiceAdditionalCharge',
      'PurchaseCreditNote',
      'PurchaseCreditNoteList',
      'PurchasePayments',
      'PurchasePaymentLine',
      'PurchaseAdditionalCharge',
      'PurchaseManualJournal',
      'PurchaseManualJournalLine',
      'PurchaseShippingAddress',
      'PurchaseUnStockLine',
      'AdvancedPurchase',
      'AdvancedPurchaseStock',
      'AdvancedPurchaseStockLine',
      'AdvancedPurchasePutAway',
      'AdvancedPurchasePutAwayLine',
      'AdvancedPurchaseInvoice',
      'AdvancedPurchaseCreditNote',
      'AdvancedPurchasePayments'
    ]
  },
  {
    file: 'Suppliers',
    description: 'Suppliers. https://dearinventory.docs.apiary.io/#reference/supplier',
    models: ['Supplier', 'SupplierAddress']
  },
  {
    file: 'Stock',
    description: 'Stock adjustments, takes and transfers. https://dearinventory.docs.apiary.io/#reference/stock',
    models: [
      'StockAdjustment',
      'StockAdjustmentList',
      'StockTake',
      'StockTakeList',
      'StockTransfer',
      'StockTransferList',
      'StockTransferOrder',
      'StockTransferOrderLine',
      'StockTransferLine',
      'InventoryWriteOff',
      'InventoryWriteOffList',
      'InventoryWriteOffLine',
      'InventoryMovementLine'
    ]
  },
  {
    file: 'Production',
    description: 'Production BOM, orders and runs.',
    models: [
      'ProductionBOM',
      'ProductionBOMOperation',
      'ProductionBOMComponent',
      'ProductionBOMResource',
      'ProductionOrder',
      'ProductionOrderListItem',
      'ProductionOrderOperation',
      'ProductionOrderComponent',
      'FinishedGoods',
      'FinishedGoodsList',
      'Disassembly',
      'DisassemblyList',
      'Journal',
      'JournalLine'
    ]
  },
  {
    file: 'Crm',
    description: 'CRM leads, opportunities and tasks.',
    models: ['Lead', 'Opportunity']
  },
  {
    file: 'Account',
    description: 'Account (Me), webhooks and transactions.',
    models: ['ME', 'MeAddress', 'MeContact', 'Webhook', 'Transactions']
  }
];

function generateCommonFile(): string {
  return `// Generated by src/scripts/cin7-core-codegen.ts from the Cin7 Core API Blueprint.
// Run \`yarn codegen:cin7-core\` to regenerate. Do not edit by hand.

import { z } from 'zod';

/**
 * Shared envelopes and helpers for the Cin7 Core API.
 */

/**
 * Standard paging envelope returned by list endpoints.
 * The collection itself is under a resource-specific key such as \`SaleList\`.
 */
export const PageEnvelopeSchema = z.looseObject({
  Total: z.number().nullable().optional(),
  Page: z.number().nullable().optional()
});

export type PageEnvelope = z.infer<typeof PageEnvelopeSchema>;

/**
 * Builds a page schema that unwraps a named list key.
 */
export function pageSchema<T extends z.ZodType>(listKey: string, itemSchema: T) {
  return PageEnvelopeSchema.extend({
    [listKey]: z.array(itemSchema).nullable().optional()
  });
}

/**
 * Error payload Cin7 Core returns alongside non-2xx status codes.
 */
export const ErrorSchema = z.looseObject({
  ErrorCode: z.number().nullable().optional(),
  Exception: z.string().nullable().optional(),
  /** Present on some validation failures. */
  Errors: z.array(z.string()).nullable().optional()
});

export type CoreError = z.infer<typeof ErrorSchema>;
`;
}

function generateModelFile(
  file: string,
  description: string,
  modelNames: string[],
  models: Map<string, ModelDef>,
  externalModels: Set<string> = new Set()
): string {
  const known = new Set([...models.keys(), ...externalModels]);
  const selected = topologicalOrder(
    new Map(
      modelNames
        .filter((name) => models.has(name) && !externalModels.has(name))
        .map((name) => [name, models.get(name)!] as const)
    )
  );

  // Pull in referenced nested models that aren't already listed or owned elsewhere.
  const withDeps = new Set(selected);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...withDeps]) {
      for (const field of models.get(name)?.fields ?? []) {
        if (
          field.ref &&
          models.has(field.ref) &&
          !withDeps.has(field.ref) &&
          !externalModels.has(field.ref)
        ) {
          withDeps.add(field.ref);
          grew = true;
        }
      }
    }
  }

  const ordered = topologicalOrder(
    new Map([...withDeps].filter((name) => models.has(name)).map((name) => [name, models.get(name)!]))
  );

  const localModels = new Set(ordered);
  const blocks: string[] = [];
  for (const name of ordered) {
    const model = models.get(name)!;
    // Deduplicate properties — the blueprint occasionally repeats a field (e.g. LastModifiedOn).
    const seen = new Set<string>();
    const uniqueFields = model.fields.filter((field) => {
      if (seen.has(field.prop)) return false;
      seen.add(field.prop);
      return true;
    });
    const lines = uniqueFields.map((field) => {
      const expr = zodForField(field, known, localModels, name);
      return `${renderDoc(field, '  ')}  ${JSON.stringify(field.prop)}: ${expr}.nullable().optional()`;
    });
    const doc = model.description
      ? `/**\n * ${cleanText(model.description)}\n */\n`
      : '';
    blocks.push(
      `${doc}export const ${name}Schema = z.looseObject({\n${lines.join(',\n')}\n});\n\nexport type ${name} = z.infer<typeof ${name}Schema>;`
    );
  }

  // Alias a few friendly names when the blueprint used plural/awkward titles.
  const aliases: Record<string, string> = {
    SalePaymentLine: 'SalePaymentLinePartial',
    SalePayment: 'SalePaymentLinePartial',
    SaleInvoice: 'SaleInvoicePartial',
    SaleCreditNote: 'SaleCreditNotePartial',
    ProductCategory: 'Category',
    UnitOfMeasure: 'Unit',
    Tax: 'TaxRule',
    Webhook: 'Webhooks',
    MeAddress: 'MeAddresses',
    MeContact: 'MeContacts'
  };

  for (const [alias, source] of Object.entries(aliases)) {
    if (!ordered.includes(alias) && models.has(source) && withDeps.has(source)) {
      blocks.push(
        `export const ${alias}Schema = ${source}Schema;\n\nexport type ${alias} = z.infer<typeof ${alias}Schema>;`
      );
    }
  }

  return [
    '// Generated by src/scripts/cin7-core-codegen.ts from the Cin7 Core API Blueprint.',
    '// Run `yarn codegen:cin7-core` to regenerate. Do not edit by hand.',
    '',
    `import { z } from 'zod';`,
    '',
    `/**`,
    ` * ${description}`,
    ` */`,
    '',
    blocks.join('\n\n'),
    ''
  ].join('\n');
}

/**
 * Infer a Product model from the JSON sample when the field table was fragmented.
 */
function enrichFromJsonSamples(text: string, models: Map<string, ModelDef>): void {
  const samples: { name: string; listKey?: string; pattern: RegExp }[] = [
    { name: 'Product', listKey: 'Products', pattern: /"Products"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    {
      name: 'ProductAvailability',
      listKey: 'ProductAvailabilityList',
      pattern: /"ProductAvailabilityList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/
    },
    { name: 'Category', pattern: /"CategoryList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'Tax', pattern: /"TaxList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]|"TaxRuleList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'UnitOfMeasure', pattern: /"UnitList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'Webhook', pattern: /"WebhookList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'Lead', pattern: /"LeadList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'Opportunity', pattern: /"opportunityList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    {
      name: 'StockAdjustment',
      pattern: /"StockAdjustmentList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/
    },
    { name: 'StockTake', pattern: /"StockTakeList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'StockTransfer', pattern: /"StockTransferList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'PaymentTerm', pattern: /"PaymentTermList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'PriceTier', pattern: /"PriceTiers?"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'MeAddress', pattern: /"MeAddressesList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'MeContact', pattern: /"MeContactsList"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ },
    { name: 'Transactions', pattern: /"Transactions"\s*:\s*\[(\s*\{[\s\S]*?\})\s*\]/ }
  ];

  for (const sample of samples) {
    if (models.has(sample.name) && (models.get(sample.name)?.fields.length ?? 0) > 5) continue;
    const match = text.match(sample.pattern);
    const body = match?.[1] || match?.[2];
    if (!body) continue;
    try {
      const obj = JSON.parse(body.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
      if (!obj || typeof obj !== 'object') continue;
      const fields: FieldDef[] = Object.entries(obj).map(([prop, value]) => ({
        prop,
        typeRaw: Array.isArray(value)
          ? 'Array'
          : value === null
            ? 'String'
            : typeof value === 'boolean'
              ? 'Boolean'
              : typeof value === 'number'
                ? 'Decimal'
                : typeof value === 'object'
                  ? 'Object'
                  : 'String',
        length: '',
        required: '',
        notes: 'Inferred from API Blueprint response sample.',
        isArray: Array.isArray(value)
      }));
      models.set(sample.name, {
        name: sample.name,
        fields,
        description: `${sample.name} (inferred from response sample)`
      });
    } catch {
      // Sample JSON in the blueprint is occasionally truncated; skip quietly.
    }
  }

  // Dedicated Product table parse — the blueprint table is large and sometimes
  // fragmented; re-parse the Product section more carefully.
  if (!models.has('Product') || (models.get('Product')?.fields.length ?? 0) < 10) {
    const section = text.match(
      /### Available Fields for Product\n([\s\S]*?)(?=\n### |\n## Product Attachments|\n## Product Availability)/
    );
    if (section) {
      const fields: FieldDef[] = [];
      for (const line of section[1].split('\n')) {
        if (!/^\|/.test(line)) continue;
        const parts = line.split('|').slice(1, -1).map((cell) => cell.trim());
        const prop = parts[0]?.match(/`([^`]+)`/)?.[1];
        if (!prop) continue;
        const parsed = parseTypeCell(parts[1] || '');
        fields.push({
          prop,
          typeRaw: parts[1] || '',
          length: parts[2] || '',
          required: parts[3] || '',
          notes: cleanText(parts[4] || ''),
          ref: parsed.ref,
          isArray: parsed.isArray
        });
      }
      if (fields.length) {
        models.set('Product', {
          name: 'Product',
          fields,
          description: 'Available Fields for Product'
        });
      }
    }
  }

  // Product Category / Tax / Unit / Payment Term tables use slightly different titles.
  const retargets: [string, RegExp][] = [
    ['ProductCategory', /### Available Fields for Product Category\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['Tax', /### Available Fields for Tax\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['UnitOfMeasure', /### Available Fields for Unit of Measure\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['PaymentTerm', /### Available Fields for Payment Term\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['PriceTier', /### Available Fields for Price Tier\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['Webhook', /### Available Fields for Webhooks?\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['Lead', /### Available Fields for Lead\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['Opportunity', /### Available Fields for Opportunity\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    [
      'StockAdjustment',
      /### Available [Ff]ields for Stock Adjustment\n([\s\S]*?)(?=\n### |\n## |\n# Group )/
    ],
    ['StockTake', /### Available [Ff]ields for Stock Take\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    [
      'StockTransfer',
      /### Available [Ff]ields for Stock Transfer\n([\s\S]*?)(?=\n### |\n## |\n# Group )/
    ],
    ['ProductAvailability', /### Available Fields for Product Availability\n([\s\S]*?)(?=\n### |\n## |\n# Group )/],
    ['ProductFamily', /### Available Fields for Product Family\n([\s\S]*?)(?=\n### |\n## |\n# Group )/]
  ];

  for (const [name, pattern] of retargets) {
    if (models.has(name) && (models.get(name)?.fields.length ?? 0) > 3) continue;
    const section = text.match(pattern);
    if (!section) continue;
    const fields: FieldDef[] = [];
    for (const line of section[1].split('\n')) {
      if (!/^\|/.test(line)) continue;
      const parts = line.split('|').slice(1, -1).map((cell) => cell.trim());
      const prop = parts[0]?.match(/`([^`]+)`/)?.[1];
      if (!prop) continue;
      const parsed = parseTypeCell(parts[1] || '');
      fields.push({
        prop,
        typeRaw: parts[1] || '',
        length: parts[2] || '',
        required: parts[3] || '',
        notes: cleanText(parts[4] || ''),
        ref: parsed.ref,
        isArray: parsed.isArray
      });
    }
    if (fields.length) {
      models.set(name, { name, fields, description: `Available Fields for ${name}` });
    }
  }
}

async function loadSpec(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to download blueprint: ${response.status}`);
    return await response.text();
  }
  return fs.readFileSync(source, 'utf8');
}

async function main(): Promise<void> {
  const specArgIndex = process.argv.indexOf('--spec');
  const source = specArgIndex === -1 ? DEFAULT_SPEC_URL : process.argv[specArgIndex + 1];

  console.log(`Reading Cin7 Core API Blueprint from ${source}`);
  const text = await loadSpec(source);
  const models = parseModels(text);
  enrichFromJsonSamples(text, models);
  console.log(`Parsed ${models.size} models`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const prettierOptions = await prettier.resolveConfig(OUT_DIR);
  const format = (contents: string) =>
    prettier.format(contents, { ...prettierOptions, parser: 'typescript' });

  fs.writeFileSync(path.join(OUT_DIR, 'Common.ts'), format(generateCommonFile()));
  console.log('  wrote Common.ts');

  const written: string[] = ['Common'];
  const claimed = new Set<string>();
  for (const group of FILE_GROUPS) {
    if (group.file === 'Common') continue;
    const uniqueModels = group.models.filter((name) => !claimed.has(name));
    const contents = generateModelFile(
      group.file,
      group.description,
      uniqueModels,
      models,
      claimed
    );
    for (const match of contents.matchAll(/export const (\w+)Schema =/g)) {
      claimed.add(match[1]);
    }
    fs.writeFileSync(path.join(OUT_DIR, `${group.file}.ts`), format(contents));
    written.push(group.file);
    console.log(`  wrote ${group.file}.ts`);
  }

  // Emit any remaining public models that weren't claimed by a group.
  const leftovers = PUBLIC_MODELS.filter((name) => models.has(name) && !claimed.has(name));
  if (leftovers.length) {
    const contents = generateModelFile(
      'Misc',
      'Additional Cin7 Core models from the API Blueprint.',
      leftovers,
      models,
      claimed
    );
    fs.writeFileSync(path.join(OUT_DIR, 'Misc.ts'), format(contents));
    written.push('Misc');
    console.log(`  wrote Misc.ts (${leftovers.length} models)`);
  }

  const index = [
    '// Generated by src/scripts/cin7-core-codegen.ts from the Cin7 Core API Blueprint.',
    '// Run `yarn codegen:cin7-core` to regenerate. Do not edit by hand.',
    '',
    ...[...written, ...HAND_WRITTEN_TYPE_FILES].map((file) => `export * from './${file}';`),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), index);
  console.log('  wrote index.ts');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
