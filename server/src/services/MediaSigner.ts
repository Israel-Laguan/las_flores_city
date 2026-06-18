import * as fs from 'fs';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const DEFAULT_TTL_SECONDS = parseInt(
  process.env.SIGNED_URL_TTL_SECONDS || '900',
  10
);

let cachedPrivateKey: string | null | undefined;
let cachedKeyPath: string | null | undefined;

function loadPrivateKey(): string | null {
  const keyPath = process.env.CDN_PRIVATE_KEY_PATH;
  if (cachedKeyPath === keyPath) {
    return cachedPrivateKey ?? null;
  }
  cachedKeyPath = keyPath;
  if (!keyPath) {
    cachedPrivateKey = null;
    return null;
  }
  try {
    cachedPrivateKey = fs.readFileSync(keyPath, 'utf8');
  } catch (err) {
    console.warn(
      `[MediaSigner] Could not read CDN private key at ${keyPath}: ${(err as Error).message}. ` +
        'Signed URL generation will fall back to the unsigned CDN URL.'
    );
    cachedPrivateKey = null;
  }
  return cachedPrivateKey;
}

/** Test-only: clear the cached private key. */
export function __resetMediaSignerCacheForTests(): void {
  cachedPrivateKey = undefined;
  cachedKeyPath = undefined;
}

export class MediaSigner {
  /**
   * Generates a short-lived signed URL for a private CDN asset.
   *
   * Uses the AWS CloudFront URL signing algorithm via
   * `@aws-sdk/cloudfront-signer`. Compatible with both AWS CloudFront and
   * Pushr.io (or any adult-CDN) edge that accepts the same signature
   * scheme. The default TTL is 15 minutes; pass a different value when
   * the player has a shorter session window.
   *
   * If `CDN_PRIVATE_KEY_PATH` is unset or unreadable, falls back to the
   * unsigned CDN URL so the rest of the app stays functional in dev.
   * Production must configure the env vars explicitly.
   */
  public static generateSecureUrl(mediaPath: string, expiresInSeconds = DEFAULT_TTL_SECONDS): string {
    const baseUrl = process.env.CDN_BASE_URL;
    if (!baseUrl) {
      throw new Error('CDN_BASE_URL is not configured');
    }

    const normalizedPath = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
    const url = `${baseUrl}${normalizedPath}`;
    const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const keyPairId = process.env.CDN_KEY_PAIR_ID;

    const privateKey = loadPrivateKey();
    if (!privateKey || !keyPairId) {
      return url;
    }

    return getSignedUrl({
      url,
      keyPairId,
      privateKey,
      dateLessThan,
    });
  }

  public static isFullyConfigured(): boolean {
    return Boolean(
      process.env.CDN_BASE_URL &&
        process.env.CDN_KEY_PAIR_ID &&
        loadPrivateKey()
    );
  }
}
