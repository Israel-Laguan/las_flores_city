import crypto from 'crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_TTL_SECONDS = 300;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = process.env.MINIO_PORT || '9000';
// Browser-reachable endpoint for MinIO. In Compose deployments MINIO_ENDPOINT
// is the container hostname (`minio`), which browsers can't resolve, so the
// signer rewrites presigned URLs to this public origin instead (the S3 client
// still uses MINIO_ENDPOINT for the actual request). When unset, presigned
// URLs keep the configured endpoint (legacy behavior).
const MINIO_PUBLIC_URL = (process.env.MINIO_PUBLIC_URL || '').trim();
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'las-flores';
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Credentials and the CDN signing secret are read lazily (per call) so `_FILE`
// secrets resolved by `resolveFileEnvVars()` during startup are honored even
// though this module is imported before the resolver runs in the entrypoints.
function getMinioCredentials(): { accessKeyId: string; secretAccessKey: string } {
  return {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  };
}
function getCdnSigningSecret(): string {
  return process.env.CDN_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-signing-secret';
}

let s3Client: S3Client | null = null;
let publicS3Client: S3Client | null = null;

function getMinioEndpointUrl(): string {
  const endpoint = MINIO_ENDPOINT.match(/^https?:\/\//) ? MINIO_ENDPOINT : `http://${MINIO_ENDPOINT}`;
  const url = new URL(endpoint);
  if (!url.port) {
    url.port = MINIO_PORT;
  }
  return url.toString().replace(/\/$/, '');
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: getMinioEndpointUrl(),
      region: 'us-east-1',
      credentials: getMinioCredentials(),
      forcePathStyle: true,
    });
  }
  return s3Client;
}

function isMinioUrl(mediaUrl: string): boolean {
  if (mediaUrl.startsWith('s3://')) return true;
  // Match only URLs whose host is the configured MinIO endpoint. We deliberately
  // avoid a loose `includes('minio')` substring test so an already-browser-
  // reachable public/CDN URL (e.g. https://cdn.example.com/minio-assets/...) is
  // NOT mistaken for an internal object and rewritten into a presigned URL.
  const endpointHost = MINIO_ENDPOINT.replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
  try {
    return new URL(mediaUrl).hostname.toLowerCase() === endpointHost;
  } catch {
    return false;
  }
}

export { isMinioUrl };

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

/**
 * Browser-reachable S3 client used ONLY for signing presigned URLs. The
 * internal `getS3Client()` signs against `MINIO_ENDPOINT` (the container host),
 * which browsers can't reach; a presigned URL is tied to the Host header it was
 * signed with, so we must sign against the public origin when one is configured
 * (otherwise rewriting the host afterward invalidates the signature →
 * SignatureDoesNotMatch). Server-side operations keep using `getS3Client()`.
 *
 * This endpoint is handed to the browser inside presigned URLs, so it must be
 * served over https: outside local development — http: is only accepted for
 * loopback (localhost / 127.0.0.1 / ::1) endpoints, otherwise the signed S3
 * credentials would travel in cleartext until they expire.
 */
function assertSecurePublicEndpoint(publicUrl: string): void {
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    throw new Error(
      `MINIO_PUBLIC_URL is not a valid URL: "${publicUrl}". It must be a full http(s) origin browsers can reach.`
    );
  }
  const hostname = url.hostname.toLowerCase();
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `MINIO_PUBLIC_URL "${publicUrl}" must use http: or https:.`,
    );
  }
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error(
      `MINIO_PUBLIC_URL "${publicUrl}" uses insecure http: for a non-loopback host. ` +
        'Presigned URLs carry S3 credentials in the query string, so they must be ' +
        'served over https: outside local development. Use http: only for localhost/127.0.0.1 endpoints.'
    );
  }
}

function getPublicS3Client(): S3Client {
  if (!publicS3Client) {
    if (MINIO_PUBLIC_URL) {
      assertSecurePublicEndpoint(MINIO_PUBLIC_URL);
    }
    const endpoint = MINIO_PUBLIC_URL
      ? MINIO_PUBLIC_URL.replace(/\/$/, '')
      : getMinioEndpointUrl();
    publicS3Client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: getMinioCredentials(),
      forcePathStyle: true,
    });
  }
  return publicS3Client;
}

export async function signMinioUrl(mediaUrl: string, expiresInSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  const location = parseS3Location(mediaUrl);
  if (!location) return mediaUrl;

  const command = new GetObjectCommand({
    Bucket: location.bucket,
    Key: location.key,
  });

  const signedUrl = await getSignedUrl(getPublicS3Client(), command, { expiresIn: expiresInSeconds });
  return signedUrl;
}

export function createCdnProxyUrl(itemId: string, userId: string, expiresInSeconds = DEFAULT_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${itemId}:${userId}:${expires}`;
  const sig = crypto.createHmac('sha256', getCdnSigningSecret()).update(payload).digest('hex');
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
  const expected = crypto.createHmac('sha256', getCdnSigningSecret()).update(payload).digest('hex');
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
