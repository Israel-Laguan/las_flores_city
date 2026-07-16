import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

// Mock database
jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
}));

// Mock ContentSkeletonGenerator
jest.mock('../../src/services/ContentSkeletonGenerator.js', () => ({
  resolveFilePath: jest.fn((item: any) => {
    const dirMap: Record<string, string> = {
      character: 'characters',
      dialogue: 'dialogues',
      scene: 'scenes',
      overlay: 'overlays',
      mission: 'missions',
      story: 'stories',
      gig: 'gigs',
      vault: 'vault',
    };
    const prefixMap: Record<string, string> = {
      character: 'char_',
      scene: 'scene_',
      dialogue: 'dialogue_',
      overlay: 'overlay_',
      mission: 'mission_',
    };
    const dir = dirMap[item.type] || item.type;
    const prefix = prefixMap[item.type] || '';
    return `${dir}/${item.slug}/${prefix}${item.slug}.yaml`;
  }),
}));

import { queryOLTP } from '../../src/database/connection.js';
import { verifyPlanCrossReferences } from '../../src/services/PlanVerificationService.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;

function makeItem(overrides: Partial<ContentPlanItem> & { slug: string; type: string }): ContentPlanItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'character' as any,
    action: 'create',
    name: 'Test Item',
    fields: {},
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  } as ContentPlanItem;
}

function makePlan(items: ContentPlanItem[], links: any[] = []): ContentPlan {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    description: 'Test plan',
    items,
    links,
    status: 'migrated',
  };
}

describe('PlanVerificationService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'verify-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('checkLorePaths', () => {
    it('passes when lore file exists', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { lore_path: 'test_char.md' },
      });

      // Create the YAML dir and lore file
      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      await fs.mkdir(yamlDir, { recursive: true });
      await fs.writeFile(path.join(yamlDir, 'test_char.md'), '# Lore');

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'lore-path-resolution');
      expect(check?.status).toBe('pass');
    });

    it('fails when lore file is missing', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { lore_path: 'missing.md' },
      });

      // Create YAML dir but no lore file
      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      await fs.mkdir(yamlDir, { recursive: true });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'lore-path-resolution');
      expect(check?.status).toBe('fail');
      expect(check?.details).toHaveLength(1);
      expect(check?.details?.[0]).toContain('missing.md');
    });

    it('skips items without lore_path', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'lore-path-resolution');
      expect(check?.status).toBe('pass');
    });
  });

  describe('checkNarrativePaths', () => {
    it('fails when narrative file is missing', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { narrative_path: 'missing_narrative.md' },
      });

      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      await fs.mkdir(yamlDir, { recursive: true });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'narrative-path-resolution');
      expect(check?.status).toBe('fail');
    });
  });

  describe('checkAssetPaths', () => {
    it('warns when asset file is missing', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { asset_paths: { portrait: 'missing.png' } },
      });

      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      await fs.mkdir(yamlDir, { recursive: true });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'asset-path-resolution');
      expect(check?.status).toBe('warn');
      expect(check?.details).toHaveLength(1);
    });

    it('passes when asset file exists in assets/', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { asset_paths: { portrait: 'test.png' } },
      });

      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      const assetsDir = path.join(yamlDir, 'assets');
      await fs.mkdir(assetsDir, { recursive: true });
      await fs.writeFile(path.join(assetsDir, 'test.png'), 'image');

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'asset-path-resolution');
      expect(check?.status).toBe('pass');
    });
  });

  describe('checkForeignKeyIntegrity', () => {
    it('fails when scene references non-existent dialogue', async () => {
      const item = makeItem({
        slug: 'test_scene',
        type: 'scene',
        fields: { available_dialogues: ['99999999-9999-9999-9999-999999999999'] },
      });

      mockQueryOLTP.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'fk-integrity');
      expect(check?.status).toBe('fail');
    });

    it('passes when all FKs are valid', async () => {
      const dialogueId = '22222222-2222-2222-2222-222222222222';
      const item = makeItem({
        slug: 'test_scene',
        type: 'scene',
        fields: { available_dialogues: [dialogueId] },
      });

      mockQueryOLTP.mockResolvedValueOnce({
        rows: [{ id: dialogueId }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'fk-integrity');
      expect(check?.status).toBe('pass');
    });
  });

  describe('checkStoryBeatReferences', () => {
    it('fails when story references non-existent beat', async () => {
      const item = makeItem({
        slug: 'test_story',
        type: 'story',
        fields: { beats: ['nonexistent_beat'] },
      });

      mockQueryOLTP.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'story-beat-references');
      expect(check?.status).toBe('fail');
    });

    it('passes with no beats', async () => {
      const item = makeItem({
        slug: 'test_story',
        type: 'story',
        fields: {},
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'story-beat-references');
      expect(check?.status).toBe('pass');
    });
  });

  describe('checkCrossPlanConsistency', () => {
    it('fails when dependsOn references non-existent item', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
        dependsOn: ['33333333-3333-3333-3333-333333333333'],
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'cross-plan-consistency');
      expect(check?.status).toBe('fail');
      expect(check?.details?.[0]).toContain('dependsOn');
    });

    it('fails when link references non-existent item', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
      });

      const link = {
        fromItem: '00000000-0000-0000-0000-000000000001',
        toItem: '44444444-4444-4444-4444-444444444444',
        field: 'available_dialogues',
        action: 'add',
      };

      const report = await verifyPlanCrossReferences(makePlan([item], [link]), tmpDir);
      const check = report.checks.find(c => c.name === 'cross-plan-consistency');
      expect(check?.status).toBe('fail');
    });
  });

  describe('checkAssetNeedStatus', () => {
    it('fails when asset need has failed status', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
        assetNeeds: [{ promptType: 'portrait', targetField: 'portrait', status: 'failed' }],
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'asset-need-status');
      expect(check?.status).toBe('fail');
    });

    it('warns when asset need is pending', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
        assetNeeds: [{ promptType: 'portrait', targetField: 'portrait', status: 'pending' }],
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      const check = report.checks.find(c => c.name === 'asset-need-status');
      expect(check?.status).toBe('warn');
    });
  });

  describe('overall report', () => {
    it('returns passed: true when no errors', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: {},
      });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      expect(report.passed).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.planId).toBe('11111111-1111-1111-1111-111111111111');
      expect(report.checkedAt).toBeTruthy();
    });

    it('returns passed: false when errors exist', async () => {
      const item = makeItem({
        slug: 'test_char',
        type: 'character',
        fields: { lore_path: 'missing.md' },
      });

      const yamlDir = path.join(tmpDir, 'characters', 'test_char');
      await fs.mkdir(yamlDir, { recursive: true });

      const report = await verifyPlanCrossReferences(makePlan([item]), tmpDir);
      expect(report.passed).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);
    });
  });
});
