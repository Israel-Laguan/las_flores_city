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

async function main() {
  const entries = await readUrlEntries();
  if (entries.length === 0) {
    console.error('No expression URLs found in', URLS_FILE);
    process.exit(1);
  }
  console.log(`Publishing ${entries.length} portraits for ${SLUG}`);

  await fs.mkdir(ASSETS_DIR, { recursive: true });

  const portraitUrls: Array<{ url: string; label: string; expression?: string }> = [];

  for (const entry of entries) {
    const filename = FILENAMES[entry.expression]!;
    const localPath = path.join(ASSETS_DIR, filename);

    console.log(`→ downloading ${entry.expression} (${entry.url.slice(0, 60)}…)`);
    const { bytes } = await download(entry.url, localPath);
    console.log(`  saved ${localPath} (${(bytes / 1024).toFixed(1)} KiB)`);

    const objectKey = `portraits/${SLUG}/${filename}`;
    const buf = await fs.readFile(localPath);
    const minioUrl = await uploadToMinio(buf, objectKey, 'image/png');
    console.log(`  uploaded → ${minioUrl}`);

    portraitUrls.push({
      url: minioUrl,
      label: 'dev',
      ...(entry.expression !== 'default' ? { expression: entry.expression } : {}),
    });
  }

  // Write portrait_urls back to the character YAML (preserving other fields).
  const raw = await fs.readFile(CHARACTER_YAML, 'utf8');
  const data = (yaml.load(raw) as Record<string, unknown>) || {};
  data.portrait_urls = portraitUrls;
  await fs.writeFile(CHARACTER_YAML, yaml.dump(data, { lineWidth: -1, noRefs: true }), 'utf8');
  console.log(`\nYAML updated: ${CHARACTER_YAML}`);
  console.log(JSON.stringify(portraitUrls, null, 2));
}

main().catch((err) => {
  console.error('Publish failed:', err.message);
  process.exit(1);
});
