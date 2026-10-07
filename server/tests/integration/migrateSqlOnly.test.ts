import { describe, it, expect } from '@jest/globals';
import { schemaOnlyRequested } from '../../src/database/migrateUtils.js';

describe('migration CLI mode', () => {
  it('opts out of content publication only with the explicit schema-only flag', () => {
    expect(schemaOnlyRequested(['node', 'migrate.ts', '--schema-only'])).toBe(true);
    expect(schemaOnlyRequested(['node', 'migrate.ts'])).toBe(false);
    expect(schemaOnlyRequested(['node', 'migrate.ts', '--other'])).toBe(false);
  });
});
