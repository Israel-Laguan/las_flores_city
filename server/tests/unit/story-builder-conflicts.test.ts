import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { checkCreateConflicts } from '../../src/services/StoryBuilderPlanOps.js';

jest.mock('../../src/content/validate.js', () => ({
  validateContent: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
}));
jest.mock('../../src/content/migrate.js', () => ({
  migrateContent: jest.fn().mockResolvedValue({ success: true, filesProcessed: 1, filesSkipped: 0, filesFailed: 0 }),
}));
jest.mock('../../src/services/StoryBuilderLore.js', () => ({
  resolveContentDir: () => (globalThis as any).__contentDir,
  generateLoreStubs: jest.fn(async () => []),
}));
jest.mock('../../src/services/PromptFileGenerator.js', () => ({
  generatePromptFiles: jest.fn(async () => []),
}));

import { stagePlan } from '../../src/services/StoryBuilderPlanOps.js';

let tmpDir: string;
let contentDir: string;

const makeItem = (overrides: any = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  type: 'character',
  action: 'create',
  name: 'Diego',
  slug: 'diego',
  fields: {},
  assetNeeds: [],
  dependsOn: [],
  ...overrides,
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-test-'));
  contentDir = path.join(tmpDir, 'content');
  await fs.mkdir(contentDir, { recursive: true });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('checkCreateConflicts', () => {
  it('returns no conflicts when targets do not exist', async () => {
    const plan: any = { items: [makeItem()] };
    const errors = await checkCreateConflicts(plan, contentDir);
    expect(errors).toHaveLength(0);
  });

  it('returns a conflict when a create item targets an existing file', async () => {
    const fullPath = path.join(contentDir, 'characters', 'diego', 'char_diego.yaml');
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'name: Diego\n', 'utf-8');

    const plan: any = { items: [makeItem()] };
    const errors = await checkCreateConflicts(plan, contentDir);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('characters/diego/char_diego.yaml');
  });

  it('ignores update items targeting existing files', async () => {
    const fullPath = path.join(contentDir, 'characters', 'diego', 'char_diego.yaml');
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'name: Diego\n', 'utf-8');

    const plan: any = { items: [makeItem({ action: 'update' })] };
    const errors = await checkCreateConflicts(plan, contentDir);
    expect(errors).toHaveLength(0);
  });
});

describe('stagePlan create-over-existing hard error', () => {
  beforeEach(() => {
    (globalThis as any).__contentDir = contentDir;
  });

  it('returns success:false when a create item targets an existing file', async () => {
    const fullPath = path.join(contentDir, 'characters', 'diego', 'char_diego.yaml');
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'name: Diego\n', 'utf-8');

    const plan: any = {
      id: '00000000-0000-0000-0000-000000000001',
      description: 'plan',
      items: [makeItem()],
      links: [],
      status: 'proposed',
    };

    const result = await stagePlan(plan);
    expect(result.success).toBe(false);
    expect(result.error).toContain("'create'");
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it('succeeds when create targets a new file', async () => {
    const plan: any = {
      id: '00000000-0000-0000-0000-000000000001',
      description: 'plan',
      items: [makeItem()],
      links: [],
      status: 'proposed',
    };

    const result = await stagePlan(plan);
    expect(result.success).toBe(true);
    expect(result.createdFiles).toContain('characters/diego/char_diego.yaml');
  });
});
