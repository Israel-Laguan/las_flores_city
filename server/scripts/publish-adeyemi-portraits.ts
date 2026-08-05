import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { uploadToMinio } from '../src/services/StorageService.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

// ============================================================
// Publish Adeyemi Ogunbiyi's expression portraits
//
// Downloads the AKOOL CDN outputs into the local staging area
// (content/characters/adeyemi_ogunbiyi/assets/), uploads each to
// MinIO under portraits/<slug>/..., and tags `portrait_urls` on the
// character YAML with expression labels (label: dev) so the
// expression-aware resolver (server + client) can pick variants.
// ============================================================

const SLUG = 'adeyemi_ogunbiyi';
const URLS_FILE = process.env.ADEYEMI_URLS_FILE || '/tmp/adeyemi_urls.txt';
const CHARACTER_YAML = path.resolve(process.cwd(), '../content/characters', SLUG, `char_${SLUG}.yaml`);
const ASSETS_DIR = path.resolve(process.cwd(), '../content/characters', SLUG, 'assets');

/** expression → local filename */
const FILENAMES: Record<string, string> = {
  default: `${SLUG}__default.png`,
  vulnerable: `${SLUG}__vulnerable.png`,
  shocked: `${SLUG}__shocked.png`,
  calculating: `${SLUG}__calculating.png`,
  tender: `${SLUG}__tender.png`,
};

interface UrlEntry {
  expression: string;
  url: string;
}

async function readUrlEntries(): Promise<UrlEntry[]> {
  const raw = await fs.readFile(URLS_FILE, 'utf8');
  const seen = new Set<string>();
  const entries: UrlEntry[] = [];
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^(\S+)\s+(\S+)$/);
    if (!m) continue;
    const [label, url] = [m[1], m[2]];
    if (FILENAMES[label] && url.startsWith('http') && !seen.has(label)) {
      entries.push({ expression: label, url });
      seen.add(label);
    }
  }
  return entries;
}

async function download(url: string, dest: string): Promise<{ bytes: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return { bytes: buf.length };
}

interface PortraitEntryLike {
  url?: string;
  label?: unknown;
  expression?: unknown;
}

type PortraitUrlEntry = { url: string; label: string; expression?: string };

/**
 * An entry's expression key: the `expression` tag when present, else the
 * implicit `default` (the fallback entry may omit the tag).
 */
function entryExpression(entry: PortraitEntryLike): string {
  return typeof entry.expression === 'string' && entry.expression
    ? entry.expression.toLowerCase()
    : 'default';
}

function stageOf(entry: PortraitEntryLike): string {
  return typeof entry.label === 'string' && entry.label ? entry.label.toLowerCase() : '';
}

/**
 * The client/server resolvers only treat UNTAGGED URLs as the resting default
 * (see client/src/utils/resolvePortraitUrl.ts), so an explicit
 * `expression: default` tag is normalized to the untagged fallback form the
 * resolver expects.
 */
function normalizeDefaultToUntagged(entry: PortraitEntryLike): PortraitEntryLike {
  if (typeof entry.expression === 'string' && entry.expression.toLowerCase() === 'default') {
    const { expression: _expression, ...rest } = entry;
    return rest;
  }
  return entry;
}

/**
 * Merge a batch of uploaded entries with the YAML's existing `portrait_urls`.
 * Uploaded entries replace only the existing entry with the same
 * (label, expression) pair — publishing a `dev` variant must never remove a
 * `production`/`staging` variant of the same expression. `default` (fallback)
 * entries are kept first so a partial upload that omits the default never
 * promotes an expression variant to the fallback.
 */
function buildMergedPortraitUrls(
  uploaded: PortraitUrlEntry[],
  existing: Array<Record<string, unknown>>,
): Array<PortraitEntryLike> {
  const uploadedKeys = new Set(uploaded.map((e) => `${stageOf(e)}:${entryExpression(e)}`));
  return [
    ...uploaded,
    ...existing.filter((entry) => !uploadedKeys.has(`${stageOf(entry)}:${entryExpression(entry)}`)),
  ]
    .map((entry) => normalizeDefaultToUntagged(entry as PortraitEntryLike))
    .sort(
      (a, b) =>
        Number(entryExpression(a) !== 'default') - Number(entryExpression(b) !== 'default')
    );
}

/**
 * Replaces the top-level `portrait_urls:` block in the raw YAML text with
 * `blockBody` (the dumped array's lines). The rest of the file — including
 * all author comments and formatting — is preserved byte-for-byte.
 *
 * The block begins at the first top-level `portrait_urls:` line and ends at
 * the next non-indented, non-empty line (or EOF). If the key is not found,
 * the new block is appended at the end of the file.
 */
function replacePortraitUrlsBlock(raw: string, blockBody: string): string {
  const lines = raw.split('\n');
  const dumpLines = blockBody
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => `  ${line}`);

  const keyIdx = lines.findIndex((line) => /^portrait_urls:/.test(line));
  if (keyIdx === -1) {
    const trimmed = raw.endsWith('\n') ? raw : `${raw}\n`;
    return `${trimmed}portrait_urls:\n${dumpLines.join('\n')}\n`;
  }

  // Normalize the matched header so the dumped block becomes its value.
  // This recognizes declarations with an inline empty value (`portrait_urls: []`)
  // or an inline comment (`portrait_urls: # ...`) that the old exact-match regex
  // missed (which would have appended a duplicate top-level key). A trailing
  // inline comment is preserved for author context; an inline value is dropped
  // because a block sequence cannot follow a flow value on the same line.
  const headerComment = lines[keyIdx].match(/(\s+#.*)$/);
  lines[keyIdx] = headerComment
    ? `portrait_urls: ${headerComment[1].trim()}`
    : 'portrait_urls:';

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
  // Preserve the original EOF newline so repeated publishes don't churn the last line.
  return raw.endsWith('\n') && !updated.endsWith('\n') ? `${updated}\n` : updated;
}

async function main() {
  const entries = await readUrlEntries();
  if (entries.length === 0) {
    console.error('No expression URLs found in', URLS_FILE);
    process.exit(1);
  }
  console.log(`Publishing ${entries.length} portraits for ${SLUG}`);

  // Preflight the batch BEFORE any download/upload: read the current YAML and
  // validate the merged (upload + existing) portrait pool. A validation
  // failure now aborts with nothing written to MinIO or disk, so repeated
  // failed runs cannot orphan already-uploaded objects (previously the YAML
  // write was the only step that could fail, after every portrait was pushed).
  const raw = await fs.readFile(CHARACTER_YAML, 'utf8');
  const data = (yaml.load(raw) as Record<string, unknown>) || {};

  const existing = Array.isArray(data.portrait_urls)
    ? (data.portrait_urls as Array<Record<string, unknown>>)
    : [];

  // Structural plan for this batch — real MinIO URLs are only known after the
  // uploads, but the (label, expression) shape is fixed, which is all the
  // default/stage validation below needs.
  const plannedUploads: PortraitUrlEntry[] = entries.map((entry) => ({
    url: '',
    label: 'dev',
    ...(entry.expression !== 'default' ? { expression: entry.expression } : {}),
  }));

  const mergedPlan = buildMergedPortraitUrls(plannedUploads, existing);
  const defaults = mergedPlan.filter((entry) => !entry.expression);
  if (defaults.length === 0) {
    throw new Error(
      'Refusing to write portrait_urls with no usable default entry; partial dev uploads must include an untagged default portrait.'
    );
  }

  // Stage-aware check: the server orders the pool by the running environment's
  // stage priority, so a `dev` batch of expression variants with no `dev`
  // default resolves its resting portrait from another stage's default. That
  // still renders a correct (expression-neutral) portrait, but the mixed stages
  // are worth flagging so the author can publish a matching default. The
  // message lists every available default instead of claiming which one the
  // server selects — that selection follows stage priority, not YAML/merge
  // order.
  const publishedStage = stageOf(plannedUploads[0]);
  if (!defaults.some((entry) => stageOf(entry) === publishedStage)) {
    console.warn(
      `\n⚠ No '${publishedStage}' default portrait: available defaults: ${defaults
        .map((entry) => `'${stageOf(entry) || 'untagged'}'`)
        .join(', ')}. Publish a '${publishedStage}' default to keep stages consistent.`
    );
  }

  await fs.mkdir(ASSETS_DIR, { recursive: true });

  const portraitUrls: PortraitUrlEntry[] = [];

  for (const entry of entries) {
    const filename = FILENAMES[entry.expression]!;
    const localPath = path.join(ASSETS_DIR, filename);

    console.log(`→ downloading ${entry.expression} (${entry.url.slice(0, 60)}…)`);
    const { bytes } = await download(entry.url, localPath);
    console.log(`  saved ${localPath} (${(bytes / 1024).toFixed(1)} KiB)`);

    const objectKey = `portraits/${SLUG}/${filename}`;
    const buf = await fs.readFile(localPath);
    // NOTE: intentional one-off dev-tool upload that bypasses the coordinated
    // AssetPublishService workflow (which requires a publish plan + DB
    // bookkeeping via markPublished). The merge logic below preserves the
    // existing canonical portrait_urls entries not included in this upload.
    const minioUrl = await uploadToMinio(buf, objectKey, 'image/png');
    console.log(`  uploaded → ${minioUrl}`);

    portraitUrls.push({
      url: minioUrl,
      label: 'dev',
      ...(entry.expression !== 'default' ? { expression: entry.expression } : {}),
    });
  }

  // Write portrait_urls back to the character YAML, preserving other fields
  // AND the original author comments/formatting: only the top-level
  // `portrait_urls:` block is replaced (see replacePortraitUrlsBlock).
  // Rebuild the merge with the real upload URLs — same dedupe/normalization/
  // ordering as the preflighted plan.
  const mergedPortraitUrls = buildMergedPortraitUrls(portraitUrls, existing);

  // Serialize ONLY the merged array (not the whole document) and splice it
  // into the original file text at the `portrait_urls:` block, keeping all
  // author comments and formatting elsewhere intact.
  const blockBody = yaml.dump(mergedPortraitUrls, { lineWidth: -1, noRefs: true });
  const updatedRaw = replacePortraitUrlsBlock(raw, blockBody);

  await fs.writeFile(CHARACTER_YAML, updatedRaw, 'utf8');
  console.log(`\nYAML updated: ${CHARACTER_YAML}`);
  console.log(JSON.stringify(portraitUrls, null, 2));
}

main().catch((err) => {
  console.error('Publish failed:', err.message);
  process.exit(1);
});
