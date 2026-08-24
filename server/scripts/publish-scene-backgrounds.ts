import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { uploadToMinio } from '../src/services/StorageService.js';
import { queryOLTP } from '@las-flores/infra';

// Extract the scene `id:` (top-level UUID) from the raw YAML without parsing
// the whole document — some scene YAMLs have malformed bodies that js-yaml
// rejects, but the `id` line is always well-formed at the top.
function extractSceneId(raw: string): string | null {
  const m = raw.match(/^id:\s*([0-9a-fA-F-]{36})/m);
  return m ? m[1] : null;
}

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// ============================================================
// Publish scene background environment variants (M42 closeout)
//
// Reads scripts/asset-pipeline/output/scene_background_variants.csv,
// uploads each <slug>__<variant>.png to
// s3://las-flores/backgrounds/<slug>/<slug>__<variant>.png, and
// merges variant-tagged entries into each scene YAML's
// background_urls[] (variant tag: night/sunset/day/rain ...). The
// untagged default entry is preserved (prefixed first).
// ============================================================

const CSV_PATH =
  process.env.SCENE_VARIANT_CSV ||
  path.resolve(process.cwd(), '../scripts/asset-pipeline/output/scene_background_variants.csv');
const CONTENT_ROOT = path.resolve(process.cwd(), '../content/scenes');

interface CsvRow {
  path: string;
  slug: string;
  variant: string;
  done: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const p = idx('path');
  const s = idx('slug');
  const v = idx('variant');
  const d = idx('done');
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    rows.push({
      path: cells[p] ?? '',
      slug: cells[s] ?? '',
      variant: cells[v] ?? '',
      done: cells[d] ?? '',
    });
  }
  return rows;
}

// Minimal CSV parser: splits on commas, honors double-quoted fields that may
// contain embedded commas/newlines.
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

interface BgEntryLike {
  url?: string;
  label?: unknown;
  variant?: unknown;
}

type BgUrlEntry = { url: string; label: string; variant: string };

function entryVariant(entry: BgEntryLike): string {
  return typeof entry.variant === 'string' && entry.variant
    ? entry.variant.toLowerCase()
    : 'default';
}

function stageOf(entry: BgEntryLike): string {
  return typeof entry.label === 'string' && entry.label ? entry.label.toLowerCase() : '';
}

// The client/server resolvers treat UNTAGGED urls as the resting default, so an
// explicit `variant: default` is normalized to the untagged fallback form.
function normalizeDefaultToUntagged(entry: BgEntryLike): BgEntryLike {
  if (typeof entry.variant === 'string' && entry.variant.toLowerCase() === 'default') {
    const { variant: _variant, ...rest } = entry;
    return rest;
  }
  return entry;
}

// Merge uploaded entries with existing background_urls. Uploaded entries
// replace only the existing entry with the same (label, variant) pair. The
// default (untagged) entry is kept first so a partial upload never promotes a
// variant to the fallback position.
function buildMerged(merged: BgUrlEntry[], existing: Array<Record<string, unknown>>): Array<BgEntryLike> {
  const uploadedKeys = new Set(merged.map((e) => `${stageOf(e)}:${entryVariant(e)}`));
  return [
    ...merged,
    ...existing.filter((entry) => !uploadedKeys.has(`${stageOf(entry)}:${entryVariant(entry)}`)),
  ]
    .map((entry) => normalizeDefaultToUntagged(entry as BgEntryLike))
    .sort((a, b) => Number(entryVariant(a) !== 'default') - Number(entryVariant(b) !== 'default'));
}

function replaceBackgroundUrlsBlock(raw: string, blockBody: string): string {
  const lines = raw.split('\n');
  const dumpLines = blockBody
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `  ${line}`);

  const keyIdx = lines.findIndex((line) => /^background_urls:/.test(line));
  if (keyIdx === -1) {
    const trimmed = raw.endsWith('\n') ? raw : `${raw}\n`;
    return `${trimmed}background_urls:\n${dumpLines.join('\n')}\n`;
  }

  const headerComment = lines[keyIdx].match(/(\s+#.*)$/);
  lines[keyIdx] = headerComment ? `background_urls: ${headerComment[1].trim()}` : 'background_urls:';

  let endIdx = keyIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0 || /^\s/.test(line)) {
      endIdx++;
      continue;
    }
    break;
  }

  const updated = [
    ...lines.slice(0, keyIdx + 1),
    ...dumpLines,
    ...lines.slice(endIdx),
  ].join('\n');
  return raw.endsWith('\n') && !updated.endsWith('\n') ? `${updated}\n` : updated;
}

// Extract existing background_urls entries from the raw YAML text without
// parsing the whole document. This avoids choking on otherwise-malformed
// scene YAMLs (e.g. an unquoted `description:` containing a `key: value`
// substring) — we only need the url/label/variant of each list item.
function extractExistingBackgroundUrls(raw: string): Array<Record<string, unknown>> {
  const lines = raw.split('\n');
  const keyIdx = lines.findIndex((line) => /^background_urls:/.test(line));
  if (keyIdx === -1) return [];
  let endIdx = keyIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0 || /^\s/.test(line)) {
      endIdx++;
      continue;
    }
    break;
  }
  const block = lines.slice(keyIdx + 1, endIdx).join('\n');
  try {
    const parsed = yaml.load(block);
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  } catch {
    // fall through to regex extraction
  }
  const entries: Array<Record<string, unknown>> = [];
  const itemRe = /^\s*-\s*url:\s*(\S+)\s*(?:#.*)?$/;
  const labelRe = /^\s+label:\s*(\S+)/;
  const variantRe = /^\s+variant:\s*(\S+)/;
  let cur: Record<string, unknown> | null = null;
  for (const line of block.split('\n')) {
    const m = line.match(itemRe);
    if (m) {
      if (cur) entries.push(cur);
      cur = { url: m[1] };
    } else if (cur) {
      const l = line.match(labelRe);
      const v = line.match(variantRe);
      if (l) cur.label = l[1];
      if (v) cur.variant = v[1];
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

// Locate the scene YAML for a slug. Most scenes use `scene_<slug>.yaml`, but a
// few legacy folders name it `<slug>.yaml` (e.g. the_apartment, welcome_center).
// Pick the first non-lore/non-prompt YAML in the folder.
async function resolveSceneYaml(root: string, slug: string): Promise<string> {
  const dir = path.join(root, slug);
  const candidates = [
    path.join(dir, `scene_${slug}.yaml`),
    path.join(dir, `${slug}.yaml`),
  ];
  for (const c of candidates) {
    if (fssync.existsSync(c)) return c;
  }
  const entries = (await fs.readdir(dir)).filter(
    (f) => f.endsWith('.yaml') && !f.endsWith('.prompt.md.yaml'),
  );
  if (entries.length === 1) return path.join(dir, entries[0]);
  throw new Error(`No scene YAML found for slug ${slug} in ${dir}`);
}

async function main() {
  const rawCsv = await fs.readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(rawCsv).filter((r) => r.done === '1' && r.slug && r.variant && r.path);
  if (rows.length === 0) {
    console.error('No done rows found in', CSV_PATH);
    process.exit(1);
  }
  console.log(`Publishing ${rows.length} scene background variants`);

  // Group rows by slug so we upload first, then rewrite each YAML once.
  const bySlug = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
    bySlug.get(row.slug)!.push(row);
  }

  let uploadedCount = 0;
  const perScene: Array<{ slug: string; variants: string[]; yaml: string }> = [];

  for (const [slug, slugRows] of bySlug) {
    const yamlPath = await resolveSceneYaml(CONTENT_ROOT, slug);
    const raw = await fs.readFile(yamlPath, 'utf8');
    const existing = extractExistingBackgroundUrls(raw);

    const uploaded: BgUrlEntry[] = [];
    const variants: string[] = [];

    for (const row of slugRows) {
      const localPath = path.resolve(process.cwd(), '..', row.path);
      const filename = path.basename(localPath);
      const objectKey = `backgrounds/${slug}/${filename}`;
      const buf = await fs.readFile(localPath);
      const minioUrl = await uploadToMinio(buf, objectKey, 'image/png');
      uploaded.push({ url: minioUrl, label: 'dev', variant: row.variant });
      variants.push(row.variant);
      uploadedCount++;
      console.log(`  ${slug}/${filename} → ${minioUrl}`);
    }

    const merged = buildMerged(uploaded, existing);
    const blockBody = yaml.dump(merged, { lineWidth: -1, noRefs: true });
    const updatedRaw = replaceBackgroundUrlsBlock(raw, blockBody);
    await fs.writeFile(yamlPath, updatedRaw, 'utf8');
    console.log(`  ✓ wrote ${yamlPath} (${merged.length} background_urls)`);

    // Mirror the YAML change into the DB `scenes.background_urls` column (the
    // runtime serves this JSONB array, not the YAML). The scene id is read from
    // the raw YAML header; scenes missing an id are skipped (shouldn't happen).
    const sceneId = extractSceneId(raw);
    if (sceneId) {
      await queryOLTP(
        `UPDATE scenes SET background_urls = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(merged), sceneId],
      );
      console.log(`  ✓ db scenes.${sceneId} background_urls updated (${merged.length})`);
    } else {
      console.warn(`  ⚠ no scene id found in ${yamlPath}; DB NOT updated`);
    }

    perScene.push({ slug, variants, yaml: yamlPath });
  }

  console.log(`\nUploaded ${uploadedCount} variants across ${perScene.length} scenes.`);
  console.log(JSON.stringify(perScene, null, 2));
}

main().catch((err) => {
  console.error('Publish failed:', err.message);
  process.exit(1);
});
