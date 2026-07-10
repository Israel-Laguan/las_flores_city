/**
 * Shared helpers for the lore-asset MinIO backup/restore scripts.
 * Config defaults mirror server/src/services/StorageService.ts so the scripts
 * talk to the same MinIO the app uses.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { S3Client } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/lib/ -> repo root is two levels up.
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = process.env.MINIO_PORT || '9000';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';

export const BUCKET = process.env.MINIO_BUCKET || 'las-flores';
export const BACKUP_PREFIX = (process.env.BACKUP_PREFIX || 'backups').replace(/\/+$/, '');

function endpointUrl() {
  const raw = /^https?:\/\//.test(MINIO_ENDPOINT) ? MINIO_ENDPOINT : `http://${MINIO_ENDPOINT}`;
  const url = new URL(raw);
  if (!url.port) url.port = MINIO_PORT;
  return url.toString().replace(/\/$/, '');
}

export function makeS3Client() {
  return new S3Client({
    endpoint: endpointUrl(),
    region: 'us-east-1',
    credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
}

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.txt': 'text/plain',
};

export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Normalize a path to forward slashes for use as an S3 key. */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** Recursively yield absolute file paths under a directory. */
export async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}
