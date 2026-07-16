import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs, { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SCRIPT = path.resolve(process.cwd(), '../scripts/asset-pipeline/scripts/generate-prompt.mjs');

function tmpContentDir() {
  const dir = path.join(os.tmpdir(), 'lf-generate-prompt-test-' + Date.now());
  fs.mkdirSync(path.join(dir, 'content', 'characters', 'test_offline_char'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'content', 'locations', 'test_offline_loc'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'content', 'characters', 'test_offline_char', 'test_offline_char.md'),
    '# Test Offline Char\n\n**Age (2077):** 30\n**Role:** bartender\n**District:** Puerto\n\n## Physical Description\n- Tall, cybernetic arm\n\n## Personality\nFriendly.\n',
  );
  fs.writeFileSync(
    path.join(dir, 'content', 'characters', 'test_offline_char', 'char_test_offline_char.yaml'),
    'id: char_test_offline_char\nname: Test Offline Char\n',
  );
  fs.writeFileSync(
    path.join(dir, 'content', 'locations', 'test_offline_loc', 'location_test_offline_loc.yaml'),
    'id: location_test_offline_loc\nname: Test Offline Loc\n',
  );
  return dir;
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = tmpContentDir();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generate-prompt.mjs writes into content/ per-folder layout', () => {
  it('portrait from a colocated .md produces <slug>.prompt.md next to the source', () => {
    execFileSync(process.execPath, [SCRIPT, '--type', 'portrait', '--source', 'content/characters/test_offline_char/test_offline_char.md', '--force'], { cwd: tmpDir });
    const expected = path.join(tmpDir, 'content', 'characters', 'test_offline_char', 'test_offline_char.prompt.md');
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('character-sheet from a colocated .yaml produces <slug>.character-sheet.prompt.md in the entity folder', () => {
    execFileSync(process.execPath, [SCRIPT, '--type', 'character-sheet', '--source', 'content/characters/test_offline_char/char_test_offline_char.yaml', '--force'], { cwd: tmpDir });
    const expected = path.join(tmpDir, 'content', 'characters', 'test_offline_char', 'test_offline_char.character-sheet.prompt.md');
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('location-map from a colocated .yaml produces <slug>.map.md in the entity folder', () => {
    execFileSync(process.execPath, [SCRIPT, '--type', 'location-map', '--source', 'content/locations/test_offline_loc/location_test_offline_loc.yaml', '--force'], { cwd: tmpDir });
    const expected = path.join(tmpDir, 'content', 'locations', 'test_offline_loc', 'test_offline_loc.map.md');
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('acceptance: no legacy docs/lore/figures or docs/lore/landmarks strings remain in the generator source', async () => {
    const src = fs.readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toContain('docs/lore/figures');
    expect(src).not.toContain('docs/lore/landmarks');
  });
});
