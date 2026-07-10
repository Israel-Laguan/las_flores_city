#!/usr/bin/env node
/**
 * backup-lore-assets.mjs
 *
 * Durable backup for git-IGNORED lore binary assets (portraits, backgrounds,
 * tiles, etc.) that live on disk under docs/lore but are intentionally NOT
 * committed to git (.gitignore excludes *.png / *.jpg). Because git does not
 * track them, a `git clean -fdx`, a buggy script, or an accidental delete wipes
 * them with no way to `git restore`. This mirrors them into MinIO so there is
 * always a recoverable copy.
 *
 * SAFE to run repeatedly: it uploads new/changed files only (size compare) and
 * NEVER deletes remote objects, so a local wipe can never propagate to the
 * backup.
 *
 * Usage:
 *   node scripts/backup-lore-assets.mjs [LOCAL_PATH]
 *   npm run assets:backup -- [LOCAL_PATH]
 *
 *   LOCAL_PATH   Directory to back up (default: docs/lore). Relative to repo root.
 *
 * Environment (defaults match server/src/services/StorageService.ts):
 *   MINIO_ENDPOINT   default: localhost
 *   MINIO_PORT       default: 9000
 *   MINIO_ACCESS_KEY default: minioadmin
 *   MINIO_SECRET_KEY default: minioadmin
 *   MINIO_BUCKET     default: las-flores
 *   BACKUP_PREFIX    default: backups
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PutObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

import {
  REPO_ROOT,
  BUCKET,
  BACKUP_PREFIX,
  makeS3Client,
  contentTypeFor,
  walkFiles,
  toPosix,
} from './lib/minio-backup.mjs';

async function ensureBucket(client) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[backup] Created bucket: ${BUCKET}`);
  }
}

async function remoteSize(client, key) {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return head.ContentLength ?? -1;
  } catch {
    return null; // not present
  }
}

async function main() {
  const localRel = toPosix(process.argv[2] || 'docs/lore');
  const localPath = path.resolve(REPO_ROOT, localRel);

  const stat = await fs.stat(localPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    console.error(`error: local path does not exist or is not a directory: ${localPath}`);
    process.exit(1);
  }

  const client = makeS3Client();
  console.log('== Lore asset backup ==');
  console.log(`  local : ${localPath}`);
  console.log(`  remote: s3://${BUCKET}/${BACKUP_PREFIX}/${localRel}`);

  await ensureBucket(client);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for await (const filePath of walkFiles(localPath)) {
    const relFromLocal = toPosix(path.relative(localPath, filePath));
    const key = `${BACKUP_PREFIX}/${localRel}/${relFromLocal}`;
    const body = await fs.readFile(filePath);

    const existing = await remoteSize(client, key);
    if (existing === body.length) {
      skipped++;
      continue;
    }

    try {
      await client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(filePath),
      }));
      uploaded++;
    } catch (err) {
      failed++;
      console.error(`  ✗ ${relFromLocal}: ${err.message}`);
    }
  }

  console.log('\nBackup complete.');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Skipped (unchanged): ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  if (failed > 0) process.exit(1);
}

// Only run when invoked directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
}
