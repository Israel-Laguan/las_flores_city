import crypto from 'crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_TTL_SECONDS = 300;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = process.env.MINIO_PORT || '9000';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'las-flores';
const CDN_SIGNING_SECRET = process.env.CDN_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-signing-secret';
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = MINIO_ENDPOINT.includes(':') && !MINIO_ENDPOINT.startsWith('http') 
      ? `http://${MINIO_ENDPOINT}`
      : `http://${MINIO_ENDPOINT}:${MINIO_PORT}`;
    
    s3Client = new S3Client({
      endpoint: endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

function isMinioUrl(mediaUrl: string): boolean {
  if (mediaUrl.startsWith('s3://')) return true;
  const minioHost = `${MINIO_ENDPOINT}:${MINIO_PORT}`;
  return mediaUrl.includes(minioHost) || mediaUrl.includes('minio');
}

function parseS3Location(mediaUrl: string): { bucket: string; key: string } | null {
  if (mediaUrl.startsWith('s3://')) {
    const withoutScheme = mediaUrl.slice(5);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex === -1) return null;
    return {
      bucket: withoutScheme.slice(0, slashIndex),
      key: withoutScheme.slice(slashIndex + 1),
    };
  }

  try {
    const url = new URL(mediaUrl);
    const pathParts = url.pathname.replace(/^\//, '').split('/');
    if (pathParts.length < 2) return null;
    return { bucket: pathParts[0], key: pathParts.slice(1).join('/') };
  } catch {
    return null;
  }
}

export async function signMinioUrl(mediaUrl: string, expiresInSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  const location = parseS3Location(mediaUrl);
  if (!location) return mediaUrl;

  const command = new GetObjectCommand({
    Bucket: location.bucket,
    Key: location.key,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

export function createCdnProxyUrl(itemId: string, userId: string, expiresInSeconds = DEFAULT_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${itemId}:${userId}:${expires}`;
  const sig = crypto.createHmac('sha256', CDN_SIGNING_SECRET).update(payload).digest('hex');
  return `${API_BASE_URL}/vault/media/${itemId}?expires=${expires}&sig=${sig}`;
}

export function verifyCdnProxySignature(
  itemId: string,
  userId: string,
  expires: number,
  sig: string
): boolean {
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const payload = `${itemId}:${userId}:${expires}`;
  const expected = crypto.createHmac('sha256', CDN_SIGNING_SECRET).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function resolveMediaUrl(
  mediaUrl: string,
  options: {
    requiresSignedUrl: boolean;
    itemId: string;
    userId: string;
    expiresInSeconds?: number;
  }
): Promise<string> {
  const ttl = options.expiresInSeconds ?? DEFAULT_TTL_SECONDS;

  if (isMinioUrl(mediaUrl)) {
    return signMinioUrl(mediaUrl, ttl);
  }

  if (options.requiresSignedUrl) {
    return createCdnProxyUrl(options.itemId, options.userId, ttl);
  }

  return mediaUrl;
}

export async function fetchCdnMedia(mediaUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch media: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

// Cache for bucket existence checks
let bucketExistsCache: boolean | null = null;

/**
 * Ensure the MinIO bucket exists, create it if it doesn't
 */
async function ensureBucketExists(): Promise<void> {
  if (bucketExistsCache === true) return;
  
  const { CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
  const client = getS3Client();
  
  try {
    // Check if bucket exists
    await client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
    bucketExistsCache = true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
      // Bucket doesn't exist, create it
      try {
        await client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
        bucketExistsCache = true;
        console.log(`[MinIO] Created bucket: ${MINIO_BUCKET}`);
      } catch (createErr: any) {
        // MinIO might already have the bucket created by another process
        // Check again after creation attempt
        try {
          await client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
          bucketExistsCache = true;
          console.log(`[MinIO] Bucket ${MINIO_BUCKET} already exists or was created by another process`);
        } catch {
          console.error(`[MinIO] Failed to create bucket ${MINIO_BUCKET}:`, createErr.message);
          throw createErr;
        }
      }
    } else {
      // Some other error
      console.error(`[MinIO] Error checking bucket ${MINIO_BUCKET}:`, err.message);
      throw err;
    }
  }
}

export async function uploadToMinio(buffer: Buffer, key: string, contentType: string = 'image/png'): Promise<string> {
  // Ensure bucket exists before uploading
  await ensureBucketExists();
  
  const command = new PutObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await getS3Client().send(command);
  return `s3://${MINIO_BUCKET}/${key}`;
}

export async function deleteFromMinio(mediaUrl: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const location = parseS3Location(mediaUrl);
  if (!location) return;

  const command = new DeleteObjectCommand({
    Bucket: location.bucket,
    Key: location.key,
  });
  await getS3Client().send(command);
}
