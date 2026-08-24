import fs from 'node:fs';
import path from 'node:path';
import { truncateAtWord, NIM_PROMPT_LIMIT } from './generate-images.mjs';

// M42 scene-background variant CSV generator.
//
// Emits scripts/asset-pipeline/output/scene_background_variants.csv with one row
// per staged `## Environment Variants` entry in content/scenes/*/<slug>.prompt.md.
// Each row carries the published default background to use as the image-to-image
// base and the authored edit prompt, mirroring the
// missing_expression_variants.csv format (path,prompt,...,done).
//
// Additionally each row carries `t2i_prompt`: a self-contained text-to-image
// prompt that mixes the scene's base prompt (`## Prompt` section), the variant
// edit prompt (with its i2i preamble stripped) and the negative prompt
// (`## Negative Prompt`, folded in as a "NO ..." clause). This is what makes
// NIM usable for variants: NIM's text-to-image endpoint has no image reference
// and no separate negative field, and rejects prompts over NIM_PROMPT_LIMIT
// characters — so the mix is fitted to that cap here at CSV-generation time.

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

/**
 * Extract the body of a `## <title>` markdown section (up to the next `## `).
 * Returns '' when the section is absent.
 */
function extractSection(raw, title) {
  const re = new RegExp(`^## ${title}\\s*\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm');
  const m = raw.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!--[\s\S]*?-->/g, '')   // strip HTML comments
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the i2i preamble so the variant prose reads standalone under t2i. */
function stripI2iPreamble(prompt) {
  return prompt.replace(/^Use the base scene as reference\.?\s*/i, '').trim();
}

/**
 * Build the self-contained text-to-image prompt for one variant row.
 *
 * Budget priority (NIM cap = NIM_PROMPT_LIMIT chars, no negative field):
 *   1. variant edit description (the distinguishing content — never dropped)
 *   2. negative prompt folded in as a trailing "NO ..." clause (~160 char cap)
 *   3. base scene prompt fills the remaining budget as subject/style context
 *
 * The naive "base + variant + NO" order fails because base prompts are ~700
 * chars: the truncation would cut off the variant-specific relighting info.
 */
function buildT2IPrompt(basePrompt, negativePrompt, variantPrompt) {
  const NEG_BUDGET = 160;
  const variantBody = stripI2iPreamble(variantPrompt).replace(/\s+/g, ' ').trim();

  // Fold "--no x, no y" negatives into a single trailing clause.
  const cleanedNeg = negativePrompt.replace(/--no\s+/gi, '').replace(/\s+/g, ' ').trim();
  const negClause = cleanedNeg ? `NO ${truncateAtWord(cleanedNeg, NEG_BUDGET)}` : '';

  const sep = 2; // separator chars between the three parts
  const negLen = negClause ? negClause.length + sep : 0;
  const baseBudget = Math.max(NIM_PROMPT_LIMIT - variantBody.length - negLen - sep, 200);
  // Trim the base context at a sentence boundary so it reads naturally.
  const flatBase = basePrompt.replace(/\s+/g, ' ').trim();
  let baseBody = truncateAtWord(flatBase, baseBudget);
  const lastStop = baseBody.lastIndexOf('. ');
  if (lastStop > baseBudget * 0.5) baseBody = baseBody.slice(0, lastStop + 1);

  let out = [baseBody, variantBody].filter(Boolean).join(' ');
  if (negClause && out.length + sep + negClause.length <= NIM_PROMPT_LIMIT) {
    out = `${out} ${negClause}`;
  }
  return truncateAtWord(out, NIM_PROMPT_LIMIT);
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
    // Base prompt for the t2i mix: prefer the refined `## Prompt` section,
    // falling back to the draft section when the refined one is absent.
    const basePrompt = extractSection(raw, 'Prompt') || extractSection(raw, 'Prompt \\(Draft\\)');
    const negativePrompt = extractSection(raw, 'Negative Prompt');
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
        t2i_prompt: buildT2IPrompt(basePrompt, negativePrompt, v.prompt),
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
