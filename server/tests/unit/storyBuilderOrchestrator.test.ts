import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { ContentPlan } from '@las-flores/shared';

// Mock content validate and migrate to avoid DB
jest.mock('../../src/content/validate.js', () => ({
  validateContent: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
}));
jest.mock('../../src/content/migrate.js', () => ({
  migrateContent: jest.fn().mockResolvedValue({ success: true, filesProcessed: 1, filesSkipped: 0, filesFailed: 0 }),
}));

import { executePlan } from '../../src/services/StoryBuilderOrchestrator.js';
import { validateContent } from '../../src/content/validate.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-builder-test-'));
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  await fs.mkdir(path.join(tmpDir, 'content'), { recursive: true });
  jest.mocked(validateContent).mockResolvedValue({ valid: true, errors: [] } as any);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: 'test-plan-00000000-0000-0000-0000-000000000001',
    description: 'Test plan',
    items: [],
    links: [],
    status: 'draft',
    ...overrides,
  };
}

describe('StoryBuilderOrchestrator', () => {
  describe('executePlan', () => {
    it('should create content files from a plan', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Diego',
            slug: 'diego',
            fields: { description: 'A bartender' },
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain('characters/diego/char_diego.yaml');

      const content = await fs.readFile(
        path.join(tmpDir, 'content', 'characters', 'diego', 'char_diego.yaml'),
        'utf-8'
      );
      expect(content).toContain('name: Diego');
    });

    it('should handle update action for existing files', async () => {
      const scenesDir = path.join(tmpDir, 'content', 'scenes', 'central_plaza');
      await fs.mkdir(scenesDir, { recursive: true });
      await fs.writeFile(
        path.join(scenesDir, 'scene_central_plaza.yaml'),
        'name: Central Plaza\ndescription: Old description\ndistrict: downtown\n',
        'utf-8'
      );

      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'scene',
            action: 'update',
            name: 'Central Plaza',
            slug: 'central_plaza',
            fields: { description: 'Updated description' },
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(true);
      const content = await fs.readFile(
        path.join(scenesDir, 'scene_central_plaza.yaml'),
        'utf-8'
      );
      expect(content).toContain('Updated description');
      expect(content).toContain('name: Central Plaza');
    });

    it('should throw for update of non-existent file', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'scene',
            action: 'update',
            name: 'Nonexistent',
            slug: 'nonexistent',
            fields: { description: 'test' },
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-existent file');
    });

    it('should throw for unsupported action', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'delete' as any,
            name: 'Diego',
            slug: 'diego',
            fields: {},
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported plan action');
    });

    it('should respect topological ordering via dependsOn', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-2',
            type: 'dialogue',
            action: 'create',
            name: 'Dialogue',
            slug: 'dialogue',
            fields: {},
            assetNeeds: [],
            dependsOn: ['item-1'],
          },
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Character',
            slug: 'character',
            fields: {},
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(2);
      expect(result.createdFiles[0]).toContain('character');
      expect(result.createdFiles[1]).toContain('dialogue');
    });

    it('should skip dependencies not in the plan (existing content)', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Diego',
            slug: 'diego',
            fields: {},
            assetNeeds: [],
            dependsOn: ['existing-scene-id'],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'A',
            slug: 'a',
            fields: {},
            assetNeeds: [],
            dependsOn: ['item-2'],
          },
          {
            id: 'item-2',
            type: 'character',
            action: 'create',
            name: 'B',
            slug: 'b',
            fields: {},
            assetNeeds: [],
            dependsOn: ['item-1'],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular dependency');
    });

    it('should throw for unknown link source item', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Diego',
            slug: 'diego',
            fields: {},
            assetNeeds: [],
            dependsOn: [],
          },
        ],
        links: [
          {
            fromItem: 'nonexistent-id',
            toItem: 'item-1',
            field: 'characters',
            action: 'add',
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown source item');
    });

    it('should throw for dangerous link fields', async () => {
      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Diego',
            slug: 'diego',
            fields: {},
            assetNeeds: [],
            dependsOn: [],
          },
        ],
        links: [
          {
            fromItem: 'item-1',
            toItem: 'something',
            field: '__proto__',
            action: 'set',
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid link field');
    });

    it('should clean up created files when validation fails', async () => {
      jest.mocked(validateContent).mockResolvedValueOnce({
        valid: false,
        errors: [{ file: 'test.yaml', message: 'Bad content', severity: 'error' }],
      } as any);

      const plan = makePlan({
        items: [
          {
            id: 'item-1',
            type: 'character',
            action: 'create',
            name: 'Diego',
            slug: 'diego',
            fields: {},
            assetNeeds: [],
            dependsOn: [],
          },
        ],
      });

      const result = await executePlan(plan);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toHaveLength(1);

      const fileExists = await fs
        .access(path.join(tmpDir, 'content', 'characters', 'char_diego.yaml'))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });
});
