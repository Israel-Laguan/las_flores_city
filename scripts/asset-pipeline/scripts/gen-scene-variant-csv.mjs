import fs from 'node:fs';
import path from 'node:path';

// M42 scene-background variant CSV generator.
//
// Emits scripts/asset-pipeline/output/scene_background_variants.csv with one row
// per staged `## Expression Variants` entry in content/scenes/*/<slug>.prompt.md.
// Each row carries the published default background to use as the image-to-image
// base and the authored edit prompt, mirroring the
// missing_expression_variants.csv format (path,prompt,...,done).

const ROOT = path.resolve(process.cwd());
const SCENES = path.join(ROOT, 'content', 'scenes');
const OUT = path.join(ROOT, 'scripts', 'asset-pipeline', 'output', 'scene_background_variants.csv');

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function sizeToRatio(size) {
  const m = String(size || '').match(/^(\d+)x(\d+)$/);
  if (!m) return '';
  const a = Number(m[1]);
  const b = Number(m[2]);
  const g = (x, y) => (y ? g(y, x % y) : x);
  const d = g(a, b);
  return `${a / d}:${b / d}`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function extractVariants(raw) {
  // Entries look like: - **`__night.png`**: Use the base scene as reference. ...
  const out = [];
  const re = /^-\s+\*\*`__(?<tag>[a-z0-9_-]+)\.png`\*\*:\s*(?<prompt>.+)$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out.push({ tag: m.groups.tag.trim(), prompt: m.groups.prompt.trim() });
  }
  return out;
}

function main() {
  const rows = [];
  for (const slug of fs.readdirSync(SCENES).sort()) {
    const dir = path.join(SCENES, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    const promptPath = path.join(dir, `${slug}.prompt.md`);
    if (!fs.existsSync(promptPath)) continue;
    const raw = fs.readFileSync(promptPath, 'utf8');
    const fm = parseFrontmatter(raw);
    const ratio = sizeToRatio(fm.size);
    const baseLocal = path.join('content', 'scenes', slug, 'assets', `${slug}__default.png`);
    const baseS3 = `s3://las-flores/backgrounds/${slug}/${slug}__default.png`;
    for (const v of extractVariants(raw)) {
      rows.push({
        path: path.join('content', 'scenes', slug, 'assets', `${slug}__${v.tag}.png`),
        slug,
        variant: v.tag,
        base_local: baseLocal,
        base_s3: baseS3,
        prompt: v.prompt,
        nim_safe_prompt: v.prompt.replace(/--no [^.,]+\.?/gi, '').replace(/\s+/g, ' ').trim(),
        ratio,
        done: 0,
      });
    }
  }

  const header = Object.keys(rows[0] || { path: '', done: 0 });
  const body = rows.map((r) => header.map((h) => csvEscape(r[h])).join(',')).join('\n');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${header.join(',')}\n${body}\n`, 'utf8');
  console.log(`wrote ${rows.length} row(s) -> ${path.relative(ROOT, OUT)}`);
}

main();
