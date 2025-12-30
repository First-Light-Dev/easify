import * as fs from 'fs';

const filePath = 'src/shopify/generated/admin.generated.d.ts';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('interface AdminQueries', 'interface PkgAdminQueries')
                .replace('interface AdminMutations', 'interface PkgAdminMutations');

fs.writeFileSync(filePath, content);