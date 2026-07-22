import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAllContent } from '../src/content/validate.js';

(async () => {
  const contentDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../content',
  );
  const r = await validateAllContent(contentDir, true);
  const errs = r.errors.filter((e) => e.severity === 'error');
  console.log('VALID:', r.valid, '| ERROR COUNT:', errs.length);
  errs.slice(0, 40).forEach((e) =>
    console.log((e.file || '').split('/').pop(), '::', String(e.message).slice(0, 200))
  );
  process.exitCode = r.valid ? 0 : 1;
})();
