import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '../../../content');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const meta = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const rawVal = line.slice(colon + 1).trim();
    // Strip surrounding backticks/backquoted code fences if present
    const val = rawVal.replace(/^`|`$/g, '').trim();
    meta[key] = val;
  }
  return meta;
}

function extractSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let current = null;
  let currentContent = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections[current] = currentContent.join('\n').trim();
      current = line.slice(3).trim();
      currentContent = [];
    } else if (current) {
      currentContent.push(line);
    }
  }
  if (current) sections[current] = currentContent.join('\n').trim();
  return sections;
}

function pickPrompt(sections) {
  // Prefer draft when present, otherwise final/main prompt
  if (sections['Prompt (Draft)']) return { text: sections['Prompt (Draft)'], source: 'draft' };
  if (sections['Prompt']) return { text: sections['Prompt'], source: 'final' };
  if (sections['Prompt — Final']) return { text: sections['Prompt — Final'], source: 'final' };
  return null;
}

function pickNegative(sections) {
  if (sections['Negative Prompt']) return sections['Negative Prompt'].trim();
  return '';
}

function hasSection(sections, ...names) {
  return names.some(n => sections[n]);
}

function walk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.name.endsWith('.prompt.md')) results.push(full);
  }
  return results;
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = walk(CONTENT_DIR);
  const entries = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const frontmatter = parseFrontmatter(raw);
    const bodyStart = raw.indexOf('---', 3);
    const body = bodyStart >= 0 ? raw.slice(bodyStart + 3).trim() : raw;
    const sections = extractSections(body);

    const prompt = pickPrompt(sections);
    if (!prompt) continue; // skip files with no recognizable prompt section

    const relativeFile = path.relative(CONTENT_DIR, file).replace(/\\/g, '/');
    entries.push({
      file: `content/${relativeFile}`,
      name: frontmatter.name || '',
      type: frontmatter.type || '',
      consumer: frontmatter.consumer || '',
      target: frontmatter.target || '',
      size: frontmatter.size || '',
      aspect_ratio: frontmatter.aspect_ratio || '',
      prompt: prompt.text,
      negative_prompt: pickNegative(sections),
      has_i2i_variants: hasSection(sections, 'Variants (image-to-image)'),
      has_expression_variants: hasSection(sections, 'Expression Variants'),
      has_variations: hasSection(sections, 'Variations'),
      prompt_source: prompt.source,
    });
  }

  const outPath = path.join(OUTPUT_DIR, 'non-i2i-prompts.json');
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(`Wrote ${entries.length} prompts to ${outPath}`);
}

main();
