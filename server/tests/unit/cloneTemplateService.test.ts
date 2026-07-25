import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import yaml from 'js-yaml';

// Use a temp directory instead of the real content directory, which is
// read-only when running inside the Podman test container.
// NOTE: This const must be defined BEFORE jest.mock() because jest.mock
// is hoisted and the factory closure captures the value at compile time.
// However, jest.mock factory functions are hoisted above imports, so we
// MUST inline the value via process.pid rather than referencing a const.
const TEST_TMP_DIR = path.join(os.tmpdir(), `clone-test-${process.pid}`);

// Mock resolveContentDir to point to our writable temp directory.
// The factory is hoisted by Jest, so we cannot reference module-level
// consts; instead we compute the path inside the factory using process.pid.
jest.mock('../../src/routes/admin-content.helpers.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const actual: Record<string, unknown> = jest.requireActual('../../src/routes/admin-content.helpers.js');
  const tmpDir = path.join(os.tmpdir(), `clone-test-${process.pid}`);
  return {
    ...actual,
    resolveContentDir: jest.fn<() => string>().mockReturnValue(tmpDir),
  };
});

import { cloneItem } from '../../src/services/CloneTemplateService.js';

/**
 * M16 verification: cloning an existing entity as a template must
 * - return a ContentPlanItem of the correct type/name
 * - strip identity fields (id/created_at/updated_at) so there is no id collision
 * - reset all asset_paths to `<slug>__default.png`
 * - null out nested relationship UUIDs and omit type-level relationship fields
 */
describe('CloneTemplateService', () => {
  const slug = `clone_test_diego_${process.pid}`;
  const relPath = `characters/${slug}/char_${slug}.yaml`;
  const absPath = path.resolve(TEST_TMP_DIR, relPath);

  const sourceYaml = yaml.dump({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Diego',
    title: 'Bartender',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
    description: 'A bartender at the Plaza',
    metadata: { type: 'human', role: 'npc', faction: 'TODO: Add faction', personality: 'TODO: Add personality' },
    relationships: [
      { target_id: '22222222-2222-2222-2222-222222222222', kind: 'ally' },
    ],
    lore_path: 'diego.md',
    narrative_path: 'diego.md',
    asset_paths: {
      portrait: 'diego__v2.png',
      biometric: 'diego__scan.png',
    },
  });

  beforeAll(async () => {
    // Ensure the temp directory exists
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, sourceYaml, 'utf-8');
  });

  afterAll(async () => {
    // Clean up the entire temp content directory
    await fs.promises.rm(TEST_TMP_DIR, { recursive: true, force: true });
  });

  it('returns a plan item with the correct type and new name', async () => {
    const item = await cloneItem(relPath, 'Diego Clone');
    expect(item.type).toBe('character');
    expect(item.name).toBe('Diego Clone');
    expect(item.action).toBe('create');
    expect(item.slug).toBe('diego_clone');
  });

  it('strips identity fields so the clone has no id collision', async () => {
    const item = await cloneItem(relPath, 'Diego Clone');
    expect(item.fields.id).toBeUndefined();
    expect(item.fields.created_at).toBeUndefined();
    expect(item.fields.updated_at).toBeUndefined();
    // item.id is a fresh uuid, never the source id
    expect(item.id).not.toBe('11111111-1111-1111-1111-111111111111');
    expect(item.fields.name).toBe('Diego');
  });

  it('resets all asset_paths to placeholder defaults', async () => {
    const item = await cloneItem(relPath, 'Diego Clone');
    expect(item.fields.asset_paths.portrait).toBe('diego_clone__default.png');
    expect(item.fields.asset_paths.biometric).toBe('diego_clone__default.png');
  });

  it('sanitizes relationship UUIDs inside relationship arrays', async () => {
    const item = await cloneItem(relPath, 'Diego Clone');
    expect(item.fields.relationships).toEqual([{ kind: 'ally' }]);
  });

  it('omits nested relationship UUIDs inside object relationship fields', async () => {
    const nestedRelPath = `dialogues/${slug}/dialogue_${slug}.yaml`;
    const nestedAbs = path.resolve(TEST_TMP_DIR, nestedRelPath);
    fs.mkdirSync(path.dirname(nestedAbs), { recursive: true });
    await fs.promises.writeFile(nestedAbs, yaml.dump({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Clone Dialogue',
      description: 'x',
      start_node_id: 'start',
      nodes: {
        start: { id: 'start', type: 'npc', speaker_id: '44444444-4444-4444-4444-444444444444', text: 'hi', choices: [] },
      },
      lore_path: 'clone.md',
    }), 'utf-8');
    try {
      const item = await cloneItem(nestedRelPath, 'Clone Dialogue');
      expect(item.fields.id).toBeUndefined();
      expect(item.fields.nodes.start.speaker_id).toBeUndefined();
      expect(item.fields.nodes.start.text).toBe('hi');
    } finally {
      await fs.promises.rm(path.dirname(nestedAbs), { recursive: true, force: true });
    }
  });

  it('rewrites lore/narrative paths to the new slug', async () => {
    const item = await cloneItem(relPath, 'Diego Clone');
    expect(item.fields.lore_path).toBe('diego_clone.md');
    expect(item.fields.narrative_path).toBe('diego_clone.md');
  });

  it('throws on an invalid source path', async () => {
    await expect(cloneItem('../secrets.yaml', 'x')).rejects.toThrow();
  });

  it('throws when the source file does not exist', async () => {
    await expect(cloneItem(`characters/${slug}/missing.yaml`, 'x')).rejects.toThrow(/not found/i);
  });
});