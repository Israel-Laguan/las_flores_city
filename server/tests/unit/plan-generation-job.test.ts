import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const cacheStore = new Map<string, any>();
const dbStore: any = { planForFill: null };

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(async (text: string) => {
    if (text.includes('INSERT INTO content_plans')) {
      return { rows: [{ id: 'aaaaaaaa-1111-2222-3333-444444444444' }], rowCount: 1 };
    }
    if (text.includes('SELECT id, plan_json, updated_at FROM content_plans WHERE status')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('SELECT plan_json FROM content_plans WHERE id')) {
      return {
        rows: [{ plan_json: (globalThis as any).__planForFill }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }),
  queryOLAP: jest.fn(async () => ({ rows: [] })),
  withOLTPTransaction: jest.fn(async (cb: any) => cb({ query: jest.fn() })),
}));

jest.mock('../../src/database/redis.js', () => ({
  getCache: jest.fn(async (key: string) => cacheStore.get(key) ?? null),
  setCache: jest.fn(async (key: string, val: any) => { cacheStore.set(key, val); return true; }),
  deleteCache: jest.fn(async (key: string) => { cacheStore.delete(key); return true; }),
}));

jest.mock('../../src/services/StoryBuilderLore.js', () => ({
  resolveContentDir: () => (globalThis as any).__contentDir,
}));

jest.mock('../../src/services/ContentSkeletonGenerator.js', () => ({
  generateYaml: jest.fn(() => 'id: x\nname: Test\n'),
  resolveFilePath: jest.fn(() => 'characters/test/char_test.yaml'),
}));

jest.mock('../../src/services/LLMService.js', () => ({
  createLLMProvider: () => ({
    generateFill: (globalThis as any).__fillImpl ?? jest.fn(async () => ({
      fields: { 'description': 'Filled description' },
      lore_refs: ['related_slug'],
    })),
  }),
}));

jest.mock('../../src/services/ContentPlanService.js', () => ({
  contentPlanService: {
    gatherContext: jest.fn(async () => ({
      characters: [],
      scenes: [],
      dialogues: [],
      missions: [],
      stories: [],
      overlays: [],
      locations: [],
    })),
  },
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
  readFile: jest.fn(async () => ''),
  access: jest.fn(async () => { throw { code: 'ENOENT' }; }),
  mkdtemp: jest.fn(async (p: string) => p),
  rm: jest.fn(async () => undefined),
}));

import { runPlanFill, resetOrphanedFillJobs, getPlanFillJobStatus } from '../../src/services/PlanGenerationJob.js';

let tmpDir: string;
let contentDir: string;

const makeItem = (overrides: any = {}) => ({
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  type: 'character',
  action: 'create',
  name: 'Test',
  slug: 'test',
  description: 'desc',
  fields: { description: 'TODO: Add description' },
  assetNeeds: [],
  dependsOn: [],
  ...overrides,
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-job-test-'));
  contentDir = path.join(tmpDir, 'content');
  await fs.mkdir(contentDir, { recursive: true });
  (globalThis as any).__contentDir = contentDir;
  (globalThis as any).__fillImpl = jest.fn(async () => ({
    fields: { 'description': 'Filled description' },
    lore_refs: ['related_slug'],
  }));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
  cacheStore.clear();
});

describe('runPlanFill', () => {
  it('fills TODO fields per-item and writes files without clobbering plan_json', async () => {
    (globalThis as any).__planForFill = {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      description: 'plan',
      items: [makeItem()],
      links: [],
      status: 'draft',
      _meta: { scaffolded_at: new Date().toISOString() },
    } as any;

    // Capture the plan written back to the DB
    let writtenPlan: any = null;
    const { withOLTPTransaction } = await import('../../src/database/connection.js');
    (withOLTPTransaction as jest.Mock).mockImplementation(async (cb: any) => {
      const mockClient = { query: jest.fn((text: string, params?: any[]) => {
        if (text.includes('UPDATE content_plans SET plan_json')) {
          writtenPlan = params?.[0];
        }
      }) };
      return cb(mockClient);
    });

    await runPlanFill('aaaaaaaa-1111-2222-3333-444444444444');

    const status = await getPlanFillJobStatus('aaaaaaaa-1111-2222-3333-444444444444');
    expect(status?.status).toBe('done');
    expect(status?.progress.completed).toBe(1);
    expect(status?.progress.total).toBe(1);
    // Verify filled fields are persisted in the plan
    expect(writtenPlan).not.toBeNull();
    expect(writtenPlan.items[0].fields.description).toBe('Filled description');
  });

  it('per-item fill failure is non-fatal and leaves TODO intact', async () => {
    (globalThis as any).__fillImpl = jest.fn(async () => { throw new Error('LLM timeout'); });

    const initialPlan = {
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      description: 'plan',
      items: [
        makeItem(),
        makeItem({ id: 'cccccccc-1111-2222-3333-444444444444', slug: 'test2' }),
      ],
      links: [],
      status: 'draft',
      _meta: { scaffolded_at: new Date().toISOString() },
    } as any;
    (globalThis as any).__planForFill = initialPlan;

    // Capture the plan written back to the DB
    let writtenPlan: any = null;
    const { withOLTPTransaction } = await import('../../src/database/connection.js');
    (withOLTPTransaction as jest.Mock).mockImplementation(async (cb: any) => {
      const mockClient = { query: jest.fn((text: string, params?: any[]) => {
        if (text.includes('UPDATE content_plans SET plan_json')) {
          writtenPlan = params?.[0];
        }
      }) };
      return cb(mockClient);
    });

    await runPlanFill('aaaaaaaa-1111-2222-3333-444444444444');

    const status = await getPlanFillJobStatus('aaaaaaaa-1111-2222-3333-444444444444');
    expect(status?.progress.total).toBe(2);
    expect(status?.progress.failed).toBe(2);
    expect(status?.status).toBe('failed');
    // Verify failed items retain their original TODO fields
    expect(writtenPlan).not.toBeNull();
    for (const item of writtenPlan.items) {
      expect(item.fields.description).toContain('TODO');
    }
  });
});

describe('resetOrphanedFillJobs', () => {
  it('returns 0 when no scaffolded draft plans exist', async () => {
    const reset = await resetOrphanedFillJobs();
    expect(reset).toBe(0);
  });
});
