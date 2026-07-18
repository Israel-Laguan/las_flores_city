import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import yaml from 'js-yaml';
import { updateExistingFile, deepMergeFields } from '../../src/services/StoryBuilderFileWriter.js';

let tmpDir: string;
let contentDir: string;
const fileSnapshots = new Map<string, string | null>();

const baseItem = (overrides: any = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  type: 'character' as const,
  action: 'update' as const,
  name: 'Diego',
  slug: 'diego',
  fields: {},
  assetNeeds: [],
  dependsOn: [],
  ...overrides,
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'filewriter-test-'));
  contentDir = path.join(tmpDir, 'content');
  await fs.mkdir(contentDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('deepMergeFields', () => {
  it('merges known nested object keys without dropping siblings', () => {
    const target = { a: 1, metadata: { x: 1, y: 2 }, asset_paths: { portrait: 'old.png' } };
    const source = { b: 2, metadata: { y: 3, z: 4 }, asset_paths: { biometric: 'new.png' } };
    const result = deepMergeFields(target, source);
    expect(result).toEqual({
      a: 1,
      b: 2,
      metadata: { x: 1, y: 3, z: 4 },
      asset_paths: { portrait: 'old.png', biometric: 'new.png' },
    });
  });

  it('replaces arrays wholesale (e.g. nodes)', () => {
    const target = { nodes: [{ id: 'a' }] };
    const source = { nodes: [{ id: 'b' }] };
    const result = deepMergeFields(target, source);
    expect(result.nodes).toEqual([{ id: 'b' }]);
  });
});

describe('updateExistingFile', () => {
  it('deep-merges known nested keys without dropping existing data', async () => {
    const fullPath = path.join(contentDir, 'characters', 'char_diego.yaml');
    const existing = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Diego',
      title: 'Bartender',
      metadata: { type: 'human', role: 'npc', faction: 'plaza' },
      asset_paths: { portrait: 'diego__default.png' },
    };
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, yaml.dump(existing), 'utf-8');

    const item = baseItem({
      fields: {
        title: 'Head Bartender',
        metadata: { role: 'bartender', personality: 'gruff' },
        asset_paths: { biometric: 'diego__biometric.png' },
      },
    });

    await updateExistingFile(item, fullPath, 'characters/char_diego.yaml', [], fileSnapshots);

    const written = yaml.load(await fs.readFile(fullPath, 'utf-8')) as any;
    // scalar override
    expect(written.title).toBe('Head Bartender');
    // nested merge keeps untouched sibling + applies new + override
    expect(written.metadata).toEqual({ type: 'human', role: 'bartender', faction: 'plaza', personality: 'gruff' });
    expect(written.asset_paths).toEqual({ portrait: 'diego__default.png', biometric: 'diego__biometric.png' });
  });
});
