import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { uploadToMinio } from '../src/services/StorageService.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// ============================================================
// M7 - bulk dev-batch publish of staged character portrait PNGs
//
// For every character folder that has staged assets and does NOT yet
// reference an untagged default in `portrait_urls`, it uploads the portrait
// PNGs (default + expression variants) to MinIO under
// `portraits/<slug>/<file>` and writes a `portrait_urls` block into
// `char_<slug>.yaml` (preserving the rest of the file). Mirrors the
// adeyemi reference flow; one-off dev tool, no game-behavior code.
// ============================================================

const CONTENT = fs.existsSync(path.resolve(process.cwd(), 'content'))
  ? path.resolve(process.cwd(), 'content')
  : path.resolve(process.cwd(), '../content');
const CHAR_ROOT = path.join(CONTENT, 'characters');
const MIN_SIZE_BYTES = 8000; // real portrait PNGs are well over 8KB

const EXPR_NAMED = new Set([
  'default','happy','sad','angry','surprised','shocked','calculating','vulnerable',
  'tender','smirk','afraid','disgusted','determined','focused','contemplative','professional',
  'suspicious','neutral','thinking','worried','excited','disappointed','confident','serious',
]);

interface LocalAsset { expr: string; file: string; size: number; suffix: string | null; }

function listPortraitAssets(slug: string, dir: string): LocalAsset[] {
  if (!fs.existsSync(dir)) return [];
  const out: LocalAsset[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/^(png|jpg|jpeg)$/i.test(name.split('.').pop() || '')) continue;
    const m = name.match(new RegExp(`^${slug}__(?<expr>[a-z]+)(?<suffix>__.+)?\.png$`, 'i'));
    if (!m) continue; // skip scene-drafts / numeric-timestamp drafts
    const expr = (m.groups?.expr || '').toLowerCase();
    if (expr === 'default') continue; // handled below
    if (!EXPR_NAMED.has(expr)) continue;
    const size = fs.statSync(path.join(dir, name)).size;
    if (size < MIN_SIZE_BYTES) continue;
    out.push({ expr, file: name, size, suffix: m.groups?.suffix ?? null });
  }
  return out;
}

function pickDefaultArtifact(slug: string, dir: string): { file: string; size: number } | null {
  const canonical = path.join(dir, `${slug}__default.png`);
  if (fs.existsSync(canonical)) {
    const size = fs.statSync(canonical).size;
    if (size >= MIN_SIZE_BYTES) return { file: `${slug}__default.png`, size };
  }
  // fall back to a timestamped default (e.g. --fill output); pick the healthiest
  let best: { file: string; size: number } | null = null;
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(`${slug}__default__`) && name.endsWith('.png')) {
        const size = fs.statSync(path.join(dir, name)).size;
        if (size >= MIN_SIZE_BYTES && (!best || size > best!.size)) best = { file: name, size };
      }
    }
  }
  return best;
}

function buildMerged(uploaded: Array<Record<string, unknown>>, existing: Array<Record<string, unknown>>) {
  const key = (e: any) => `${e.label || ''}:${(e.expression || 'default').toLowerCase()}`;
  const upKeys = new Set(uploaded.map(key));
  const merged = [...uploaded, ...existing.filter((e) => !upKeys.has(key(e)))].map((e) => {
    if ((e.expression || '').toLowerCase() === 'default') { const { expression: _x, ...rest } = e; return rest; }
    return e;
  });
  return merged;
}

function replaceBlock(raw: string, blockBody: string): string {
  const lines = raw.split('\n');
  const dump = blockBody.split('\n').filter(Boolean).map((l) => `  ${l}`);
  const keyIdx = lines.findIndex((l) => /^portrait_urls:/.test(l));
  if (keyIdx === -1) {
    const t = raw.endsWith('\n') ? raw : `${raw}\n`;
    return `${t}portrait_urls:\n${dump.join('\n')}\n`;
  }
  let end = keyIdx + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l.trim().length === 0 || /^\s/.test(l)) { end++; continue; }
    break;
  }
  const updated = [...lines.slice(0, keyIdx + 1), ...dump, ...lines.slice(end)].join('\n');
  return raw.endsWith('\n') && !updated.endsWith('\n') ? `${updated}\n` : updated;
}

function slugFolders(): string[] {
  return fs.readdirSync(CHAR_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[a-z0-9_]+$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function main() {
  let published = 0;
  let skipped = 0;
  let errors = 0;

  const only = process.env.SLUG_ONLY ? new Set(process.env.SLUG_ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const force = process.env.FORCE === '1' || process.argv.includes('--republish');

  for (const slug of slugFolders()) {
    if (only && !only.has(slug)) { skipped++; continue; }
    const dir = path.join(CHAR_ROOT, slug);
    const assetsDir = path.join(dir, 'assets');
    const yamlFile = fs.existsSync(assetsDir) ? fs.readdirSync(dir).find((f) => f.endsWith('.yaml')) : undefined;
    const resolvedYaml = yamlFile ? path.join(dir, yamlFile) : null;
    if (!resolvedYaml || !fs.existsSync(assetsDir)) { skipped++; continue; }

    const raw = fs.readFileSync(resolvedYaml, 'utf8');
    const data = (yaml.load(raw) as Record<string, any>) || {};
    const existing = Array.isArray(data.portrait_urls) ? data.portrait_urls : [];
    // Skip folders already referencing an untagged default (already wired).
    if (!force && existing.some((e: any) => !e.expression)) { skipped++; continue; }

    const def = pickDefaultArtifact(slug, assetsDir);
    if (!def) { skipped++; continue; }
    const variants = listPortraitAssets(slug, assetsDir);
    const uploads: Array<{ key: string; file: string }> = [{ key: `portraits/${slug}/${slug}__default.png`, file: def.file }];
    for (const v of variants) uploads.push({ key: `portraits/${slug}/${v.file}`, file: v.file });

    const portraitUrls: Array<Record<string, unknown>> = [];
    let ok = true;
    for (const u of uploads) {
      try {
        const buf = fs.readFileSync(path.join(assetsDir, u.file));
        const url = await uploadToMinio(buf, u.key, 'image/png');
        const isDefault = u.file === def.file && u.key.endsWith('__default.png');
        if (isDefault) portraitUrls.push({ url, label: 'dev' });
        else {
          const expr = u.key.match(/__([a-z]+)\.png$/)?.[1].toLowerCase();
          portraitUrls.push({ url, label: 'dev', expression: expr });
        }
      } catch (e: any) {
        console.error(`  ! upload failed ${slug} ${u.file}: ${e.message}`);
        ok = false;
        errors++;
      }
    }
    if (!ok || portraitUrls.length === 0) { errors++; continue; }

    const merged = buildMerged(portraitUrls, existing);
    const block = yaml.dump(merged, { lineWidth: -1, noRefs: true });
    const updated = replaceBlock(raw, block);
    fs.writeFileSync(resolvedYaml, updated, 'utf8');
    published++;
    console.log(`  ok ${slug} -> ${uploads.length} asset(s), ${portraitUrls.length} url(s)`);
  }

  console.log(`\n=== published: ${published} | skipped: ${skipped} | errors: ${errors} ===`);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
