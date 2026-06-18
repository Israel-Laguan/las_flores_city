import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { MediaSigner, __resetMediaSignerCacheForTests } from '../../src/services/MediaSigner.js';

// ============================================================
// MediaSigner Unit Tests (Task 4.4)
//
// The signer must produce a real CloudFront-style URL with the
// expected query params (Key-Pair-Id, Expires, Signature) when
// given a real RSA private key. With no key configured, it must
// gracefully fall back to the unsigned URL so dev/test environments
// don't crash. We generate a throwaway RSA key under /tmp; the
// key never leaves the test process and is deleted in afterAll.
// ============================================================

const KEY_PATH = '/tmp/cf_test_media_signer.pem';

function env(key: string): string | undefined {
  return process.env[key];
}

function restoreEnv(prev: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeAll(() => {
  execSync(`openssl genrsa -out ${KEY_PATH} 2048 2>/dev/null`);
});

beforeEach(() => {
  __resetMediaSignerCacheForTests();
});

afterAll(() => {
  try {
    fs.unlinkSync(KEY_PATH);
  } catch {
    // already gone
  }
});

describe('MediaSigner', () => {
  test('produces a CloudFront-style signed URL when key is present', () => {
    const snapshot = {
      CDN_BASE_URL: env('CDN_BASE_URL'),
      CDN_KEY_PAIR_ID: env('CDN_KEY_PAIR_ID'),
      CDN_PRIVATE_KEY_PATH: env('CDN_PRIVATE_KEY_PATH'),
    };
    process.env.CDN_BASE_URL = 'https://cdn.lasflores2077.com';
    process.env.CDN_KEY_PAIR_ID = 'APKATEST000000000000';
    process.env.CDN_PRIVATE_KEY_PATH = KEY_PATH;

    const url = MediaSigner.generateSecureUrl('/premium/clip.mp4', 600);

    expect(url).toContain('https://cdn.lasflores2077.com/premium/clip.mp4');
    expect(url).toContain('Key-Pair-Id=APKATEST000000000000');
    expect(url).toContain('Expires=');
    expect(url).toContain('Signature=');

    restoreEnv(snapshot);
  });

  test('falls back to the unsigned URL when CDN_PRIVATE_KEY_PATH is unreadable', () => {
    const snapshot = {
      CDN_BASE_URL: env('CDN_BASE_URL'),
      CDN_KEY_PAIR_ID: env('CDN_KEY_PAIR_ID'),
      CDN_PRIVATE_KEY_PATH: env('CDN_PRIVATE_KEY_PATH'),
    };
    process.env.CDN_BASE_URL = 'https://cdn.lasflores2077.com';
    process.env.CDN_KEY_PAIR_ID = 'APKATEST000000000000';
    process.env.CDN_PRIVATE_KEY_PATH = '/no/such/key.pem';

    const url = MediaSigner.generateSecureUrl('/premium/clip.mp4');

    expect(url).toBe('https://cdn.lasflores2077.com/premium/clip.mp4');
    expect(url).not.toContain('Signature=');

    restoreEnv(snapshot);
  });

  test('normalizes a mediaPath without a leading slash', () => {
    const snapshot = {
      CDN_BASE_URL: env('CDN_BASE_URL'),
      CDN_KEY_PAIR_ID: env('CDN_KEY_PAIR_ID'),
      CDN_PRIVATE_KEY_PATH: env('CDN_PRIVATE_KEY_PATH'),
    };
    process.env.CDN_BASE_URL = 'https://cdn.lasflores2077.com';
    process.env.CDN_KEY_PAIR_ID = 'APKATEST000000000000';
    process.env.CDN_PRIVATE_KEY_PATH = '/no/such/key.pem';

    const url = MediaSigner.generateSecureUrl('clues/clip.png');
    expect(url).toBe('https://cdn.lasflores2077.com/clues/clip.png');

    restoreEnv(snapshot);
  });

  test('throws when CDN_BASE_URL is missing', () => {
    const snapshot = {
      CDN_BASE_URL: env('CDN_BASE_URL'),
    };
    delete process.env.CDN_BASE_URL;

    expect(() => MediaSigner.generateSecureUrl('/premium/clip.mp4')).toThrow(/CDN_BASE_URL/);

    restoreEnv(snapshot);
  });
});
