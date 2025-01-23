import fs from 'fs';
import path from 'path';
import { defaultCodegenConfig } from './config';

export function initializeCodegen() {
  const configPath = path.join(process.cwd(), 'codegen.yml');
  fs.writeFileSync(configPath, JSON.stringify(defaultCodegenConfig, null, 2));
  
  console.log('Created codegen.yml with Shopify scalar configurations');
  console.log('Add the following to your package.json scripts:');
  console.log('"generate": "graphql-codegen"');
}