import { validateAllContent } from '../src/content/validate.js';

(async () => {
  const r = await validateAllContent('../content', true);
  const errs = r.errors.filter((e) => e.severity === 'error');
  console.log('VALID:', r.valid, '| ERROR COUNT:', errs.length);
  errs.slice(0, 40).forEach((e) =>
    console.log((e.file || '').split('/').pop(), '::', String(e.message).slice(0, 200))
  );
  process.exit(r.valid ? 0 : 1);
})();
