/**
 * Verifies every selection set in src/shiphero/resources/base/selections.ts against
 * the generated schema, so a field ShipHero renamed or removed is caught here rather
 * than as a GraphQL error at runtime.
 *
 * Usage:
 *   ts-node src/scripts/shiphero-check-selections.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import * as selections from '../shiphero/resources/base/selections';

const OBJECTS_FILE = path.join(__dirname, '..', 'shiphero', 'generated', 'objects.ts');

/** Field name to TypeScript type, per generated interface. */
type Schema = Map<string, Map<string, string>>;

function loadSchema(): Schema {
  const source = fs.readFileSync(OBJECTS_FILE, 'utf8');
  const schema: Schema = new Map();

  for (const type of source.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)) {
    const fields = new Map<string, string>();
    for (const field of type[2].matchAll(/^ {2}(\w+)\??: (.+);$/gm)) {
      fields.set(
        field[1],
        field[2]
          .replace(/ \| null/g, '')
          .replace(/\[\]$/, '')
          .trim()
      );
    }
    schema.set(type[1], fields);
  }

  return schema;
}

const SCALARS = /^(string|number|boolean|unknown|Record<)/;

function walk(
  schema: Schema,
  typeName: string,
  body: string,
  trail: string,
  problems: string[]
): void {
  const fields = schema.get(typeName);
  if (!fields) {
    problems.push(`${trail}: unknown type '${typeName}'`);
    return;
  }

  let cursor = 0;
  while (cursor < body.length) {
    if (/\s/.test(body[cursor])) {
      cursor++;
      continue;
    }

    // A field is a name, optional arguments, and an optional nested selection.
    const token = /^([A-Za-z_]\w*)\s*(\([^)]*\))?\s*/.exec(body.slice(cursor));
    if (!token) {
      cursor++;
      continue;
    }
    cursor += token[0].length;

    let nested: string | undefined;
    if (body[cursor] === '{') {
      const start = cursor;
      let depth = 0;
      while (cursor < body.length) {
        if (body[cursor] === '{') depth++;
        else if (body[cursor] === '}' && --depth === 0) {
          cursor++;
          break;
        }
        cursor++;
      }
      nested = body.slice(start + 1, cursor - 1);
    }

    const name = token[1];
    const type = fields.get(name);
    if (type === undefined) {
      problems.push(`${trail}: ${typeName}.${name} does not exist`);
      continue;
    }

    if (nested === undefined) continue;
    if (SCALARS.test(type)) {
      problems.push(`${trail}: ${typeName}.${name} is a scalar but has a nested selection`);
      continue;
    }

    walk(schema, type, nested, `${trail}.${name}`, problems);
  }
}

function main() {
  const schema = loadSchema();
  const problems: string[] = [];
  let checked = 0;

  for (const [name, rootType] of Object.entries(selections.SELECTION_ROOT_TYPES)) {
    const value = (selections as Record<string, unknown>)[name];
    const body = typeof value === 'function' ? (value as () => string)() : value;

    if (typeof body !== 'string') {
      problems.push(`${name}: not an exported selection`);
      continue;
    }

    walk(schema, rootType, body, name, problems);
    checked++;
  }

  const exported = Object.keys(selections).filter(
    (key) => key !== 'SELECTION_ROOT_TYPES' && !(key in selections.SELECTION_ROOT_TYPES)
  );
  for (const name of exported) problems.push(`${name}: missing from SELECTION_ROOT_TYPES`);

  if (problems.length) {
    console.error(`${problems.length} problem(s) in ${checked} selection(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(`All ${checked} ShipHero selections match the generated schema`);
}

main();
