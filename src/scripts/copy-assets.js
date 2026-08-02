// Copies non-TypeScript files that tsc leaves behind into dist, so they ship with
// the package. Run automatically after `tsc` by the build script.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const ASSETS = ['shiphero/generated/schema.graphql'];

let copied = 0;
for (const asset of ASSETS) {
  const from = path.join(ROOT, 'src', asset);
  const to = path.join(ROOT, 'dist', asset);

  if (!fs.existsSync(from)) {
    console.error(`copy-assets: missing ${path.join('src', asset)}`);
    process.exitCode = 1;
    continue;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

console.log(`copy-assets: copied ${copied}/${ASSETS.length} asset(s) into dist`);
