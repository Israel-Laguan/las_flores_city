import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const GENERATOR_SCRIPT = path.join(REPO_ROOT, 'scripts/asset-pipeline/scripts/gen-scene-variant-csv.mjs');
const VALIDATOR_SCRIPT = path.join(REPO_ROOT, 'scripts/asset-pipeline/scripts/verify-assets.mjs');
const NIM_PROMPT_LIMIT = 800;

type ScriptResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

let tempRoot: string;
let assetServer: http.Server;
let assetBaseUrl: string;

async function runScript(script: string, args: string[], cwd: string): Promise<ScriptResult> {
  try {
    const result = await execFileAsync('node', [script, ...args], {
      cwd,
      env: { ...process.env },
      timeout: 30_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      exitCode: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

async function createCase(name: string): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(tempRoot, `${name}-`));
  await fs.mkdir(path.join(cwd, 'content', 'characters'), { recursive: true });
  return cwd;
}

async function writeSceneYaml(cwd: string, body: string): Promise<string> {
  const scenePath = path.join(cwd, 'content', 'scenes', 'test_scene', 'scene_test_scene.yaml');
  await fs.mkdir(path.dirname(scenePath), { recursive: true });
  await fs.writeFile(scenePath, body, 'utf8');
  return path.relative(cwd, scenePath);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trimEnd().split('\n');
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-asset-pipeline-'));

  assetServer = http.createServer((request, response) => {
    const present = new Set(['/default.png', '/night.png', '/sunset.png']);
    response.statusCode = present.has(request.url || '') ? 200 : 404;
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', '4');
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    assetServer.once('error', reject);
    assetServer.listen(0, '127.0.0.1', resolve);
  });

  const address = assetServer.address() as AddressInfo;
  assetBaseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    assetServer.close((error) => (error ? reject(error) : resolve()));
  });
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('gen-scene-variant-csv.mjs', () => {
  it('emits deterministic variant rows with required safe prompt fields', async () => {
    const cwd = await createCase('generator');
    const slug = 'test_scene';
    const longBase = `A base scene for ${slug}. ${'Consistent architectural context. '.repeat(60)}`;
    const prompt = [
      '---',
      'name: Test Scene',
      'type: background',
      'size: 1280x768',
      '---',
      '',
      '## Prompt',
      longBase,
      '',
      '## Negative Prompt',
      '--no robots, no text, no logos, no modern day',
      '',
      '## Environment Variants',
      '- **`__night.png`**: Use the base scene as reference. Re-light the scene as a blue night environment with bright neon windows.',
      '- **`__sunset.png`**: Use the base scene as reference. Re-light the scene with warm sunset light and long shadows.',
      '',
    ].join('\n');

    try {
      await fs.mkdir(path.join(cwd, 'content', 'scenes', slug), { recursive: true });
      await fs.writeFile(path.join(cwd, 'content', 'scenes', slug, `${slug}.prompt.md`), prompt, 'utf8');

      const result = await runScript(GENERATOR_SCRIPT, [], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wrote 2 row(s)');

      const csvPath = path.join(cwd, 'scripts', 'asset-pipeline', 'output', 'scene_background_variants.csv');
      const csv = await fs.readFile(csvPath, 'utf8');
      const headers = parseCsvLine(csv.split('\n')[0]);
      expect(headers).toEqual([
        'path',
        'slug',
        'variant',
        'base_local',
        'base_s3',
        'prompt',
        'nim_safe_prompt',
        't2i_prompt',
        'ratio',
        'done',
      ]);

      const rows = parseCsv(csv);
      expect(rows.map((row) => row.variant)).toEqual(['night', 'sunset']);
      expect(rows[0]).toMatchObject({
        path: 'content/scenes/test_scene/assets/test_scene__night.png',
        slug,
        base_local: 'content/scenes/test_scene/assets/test_scene__default.png',
        base_s3: 's3://las-flores/backgrounds/test_scene/test_scene__default.png',
        ratio: '5:3',
        done: '0',
      });
      expect(rows[1].path).toBe('content/scenes/test_scene/assets/test_scene__sunset.png');
      expect(rows[0].nim_safe_prompt).not.toContain('--no');
      expect(rows[0].t2i_prompt).not.toContain('Use the base scene as reference.');
      expect(rows[0].t2i_prompt).toContain('blue night environment');
      expect(rows[0].t2i_prompt.length).toBeLessThanOrEqual(NIM_PROMPT_LIMIT);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});

describe('verify-assets.mjs', () => {
  it('accepts tagged scene variants and the untagged default fallback', async () => {
    const cwd = await createCase('validator-valid');
    const source = await writeSceneYaml(cwd, [
      'background_urls:',
      `  - url: ${assetBaseUrl}/default.png`,
      '    label: dev',
      `  - url: ${assetBaseUrl}/night.png`,
      '    label: dev',
      '    variant: night',
      `  - url: ${assetBaseUrl}/sunset.png`,
      '    label: dev',
      '    variant: sunset',
      '',
    ].join('\n'));

    try {
      const result = await runScript(VALIDATOR_SCRIPT, ['--source', source], cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('URLs found:       3');
      expect(result.stdout).toContain('Present:       3');
      expect(result.stdout).not.toContain('Invalid asset reference');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails when a referenced asset is missing remotely', async () => {
    const cwd = await createCase('validator-missing');
    const source = await writeSceneYaml(cwd, [
      'background_urls:',
      `  - url: ${assetBaseUrl}/default.png`,
      `  - url: ${assetBaseUrl}/missing.png`,
      '    variant: night',
      '',
    ].join('\n'));

    try {
      const result = await runScript(VALIDATOR_SCRIPT, ['--source', source], cwd);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('MISSING');
      expect(result.stdout).toContain('Asset validation failed');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('fails when an asset reference is malformed or empty', async () => {
    const cwd = await createCase('validator-invalid');
    const source = await writeSceneYaml(cwd, [
      'background_urls:',
      '  - url: not-a-supported-asset-url',
      '    variant: night',
      '  - url:',
      '    variant: sunset',
      '',
    ].join('\n'));

    try {
      const result = await runScript(VALIDATOR_SCRIPT, ['--source', source], cwd);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Invalid asset reference: url: not-a-supported-asset-url');
      expect(result.stdout).toContain('Invalid asset reference: url: (empty)');
      expect(result.stdout).toContain('Errors:       2');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });
});
