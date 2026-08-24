import { describe, it, expect, beforeEach, afterEach, jest as jestGlobals } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { checkCreateConflicts } from '../../src/services/StoryBuilderPlanOps.js';

jestGlobals.mock('../../src/content/validate.js', () => ({
  validateContent: (jestGlobals.fn() as any).mockResolvedValue({ valid: true, errors: [] }),
}));
jestGlobals.mock('../../src/content/migrate.js', () => ({
  migrateContent: (jestGlobals.fn() as any).mockResolvedValue({ success: true, filesProcessed: 1, filesSkipped: 0, filesFailed: 0 }),
}));
jestGlobals.mock('../../src/services/StoryBuilderLore.js', () => ({
  resolveContentDir: () => (globalThis as any).__contentDir,
  generateLoreStubs: jestGlobals.fn(async () => []),
}));
jestGlobals.mock('../../src/services/PromptFileGenerator.js', () => ({
  generatePromptFiles: jestGlobals.fn(async () => []),
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
  jestGlobals.restoreAllMocks();
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

describe('stagePlan on scaffolded plan (files already on disk)', () => {
  beforeEach(() => {
    (globalThis as any).__contentDir = contentDir;
  });

  it('skips checkCreateConflicts and writePlanItems when _meta.scaffolded_at is set', async () => {
    const fullPath = path.join(contentDir, 'characters', 'diego', 'char_diego.yaml');
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'name: Diego\n', 'utf-8');

    const plan: any = {
      id: '00000000-0000-0000-0000-000000000001',
      description: 'plan',
      items: [makeItem()],
      links: [],
      status: 'proposed',
      _meta: { scaffolded_at: new Date().toISOString() },
    };

    const result = await stagePlan(plan);
    expect(result.success).toBe(true);
    expect((result.itemResults as any).every((r: any) => r.status === 'skipped')).toBe(true);
    expect(result.createdFiles).toHaveLength(0);
    expect(result.updatedFiles).toHaveLength(0);
    // Verify original file content survives staging
    const contents = await fs.readFile(fullPath, 'utf-8');
    expect(contents).toBe('name: Diego\n');
  });
});

describe('stagePlan on template replay plans (template_replay marker)', () => {
  beforeEach(() => {
    (globalThis as any).__contentDir = contentDir;
  });

  it('re-staging the same template plan succeeds and overwrites its own file in place', async () => {
    const plan: any = {
      id: '00000000-0000-0000-0000-000000000002',
      description: 'template plan',
      items: [makeItem()],
      links: [],
      status: 'proposed',
      _meta: { template_replay: true },
    };

    // First staging writes the target files.
    const first = await stagePlan(plan);
    expect(first.success).toBe(true);
    expect(first.createdFiles).toContain('characters/diego/char_diego.yaml');

    // Second staging of the SAME plan must also succeed — the create-conflict
    // gate is bypassed for template replays, and the writer overwrites its own
    // targets idempotently.
    const second = await stagePlan(plan);
    expect(second.success).toBe(true);

    const contents = await fs.readFile(
      path.join(contentDir, 'characters', 'diego', 'char_diego.yaml'),
      'utf-8',
    );
    expect(contents).toContain('name: Diego');
  });

  it('still rejects unrelated create conflicts when template_replay is absent', async () => {
    const fullPath = path.join(contentDir, 'characters', 'diego', 'char_diego.yaml');
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, 'name: Diego\n', 'utf-8');

    const plan: any = {
      id: '00000000-0000-0000-0000-000000000003',
      description: 'non-template plan',
      items: [makeItem()],
      links: [],
      status: 'proposed',
    };

    const result = await stagePlan(plan);
    expect(result.success).toBe(false);
    expect(result.error).toContain("'create'");
  });
});
