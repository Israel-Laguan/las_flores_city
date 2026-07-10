#!/usr/bin/env node
/**
 * restore-lore-assets.mjs
 *
 * Restores git-IGNORED lore binary assets from the MinIO backup created by
 * scripts/backup-lore-assets.mjs. By default it only fills in MISSING local
 * files and will not overwrite files that already exist (pass --overwrite to
 * force replacing local copies with the backed-up version). It never deletes
 * local files.
 *
 * Usage:
 *   node scripts/restore-lore-assets.mjs [LOCAL_PATH] [--overwrite]
 *   npm run assets:restore -- [LOCAL_PATH] [--overwrite]
 *
 *   LOCAL_PATH   Directory to restore into (default: docs/lore). Relative to repo root.
 *   --overwrite  Replace differing local files with the backed-up version.
 *
 * Environment: see scripts/lib/minio-backup.mjs (matches StorageService.ts).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

import {
  REPO_ROOT,
  BUCKET,
  BACKUP_PREFIX,
  makeS3Client,
  toPosix,
} from './lib/minio-backup.mjs';

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const args = process.argv.slice(2);
  const overwrite = args.includes('--overwrite');
  const localRel = toPosix(args.find((a) => a !== '--overwrite') || 'docs/lore');
  const localPath = path.resolve(REPO_ROOT, localRel);

  const keyPrefix = `${BACKUP_PREFIX}/${localRel}/`;
  const client = makeS3Client();

  console.log('== Lore asset restore ==');
  console.log(`  remote: s3://${BUCKET}/${keyPrefix}`);
  console.log(`  local : ${localPath}`);
  console.log(`  mode  : ${overwrite ? 'overwrite existing' : 'fill missing only'}`);

  let restored = 0;
  let skipped = 0;
  let failed = 0;
  let found = 0;
  let continuationToken;

  do {
    let page;
    try {
      page = await client.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: keyPrefix,
        ContinuationToken: continuationToken,
      }));
    } catch (err) {
      console.error(`error: could not list backup objects: ${err.message}`);
      process.exit(1);
    }

    for (const obj of page.Contents || []) {
      found++;
      const relFromLocal = obj.Key.slice(keyPrefix.length);
      if (!relFromLocal) continue; // skip the prefix "folder" placeholder
      const target = path.join(localPath, relFromLocal);

      if (!overwrite && (await fileExists(target))) {
        skipped++;
        continue;
      }

      try {
        const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
        const buf = await streamToBuffer(res.Body);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buf);
        restored++;
      } catch (err) {
        failed++;
        console.error(`  ✗ ${relFromLocal}: ${err.message}`);
      }
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  if (found === 0) {
    console.error(`\nerror: no backup found at s3://${BUCKET}/${keyPrefix}`);
    console.error('       Run "npm run assets:backup" first.');
    process.exit(1);
  }

  console.log('\nRestore complete.');
  console.log(`  Restored: ${restored}`);
  console.log(`  Skipped (already present): ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  if (failed > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Restore failed:', err);
    process.exit(1);
  });
}
