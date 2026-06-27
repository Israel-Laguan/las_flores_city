import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join(process.cwd(), 'src/database/migrations');
const destDir = path.join(process.cwd(), 'dist/server/src/database/migrations');

fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destDir), { recursive: true });
fs.cpSync(srcDir, destDir, { recursive: true });
