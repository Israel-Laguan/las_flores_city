import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('import.meta works in ts-jest esm', () => {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  expect(typeof dirname).toBe('string');
});
