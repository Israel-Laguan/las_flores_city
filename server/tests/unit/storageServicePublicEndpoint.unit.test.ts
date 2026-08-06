import { describe, test, expect, jest, beforeEach, afterAll } from '@jest/globals';

// ============================================================
// MINIO_PUBLIC_URL scheme validation
//
// Presigned URLs carry the S3 access key + signature in the query
// string and are handed straight to the browser. If the public
// endpoint is plain http: on a routable host, those credentials
// travel in cleartext and stay replayable until the TTL expires.
// The signer must therefore refuse a non-loopback http: endpoint,
// while still allowing http: for local development.
//
// MINIO_PUBLIC_URL is read once into a module-level const, so each
// case sets the env var and re-imports the module via resetModules.
// ============================================================

const ORIGINAL_PUBLIC_URL = process.env.MINIO_PUBLIC_URL;
const ORIGINAL_ENDPOINT = process.env.MINIO_ENDPOINT;

/**
 * Load a fresh StorageService with the given MINIO_PUBLIC_URL and return
 * `signMinioUrl`, which is the only exported path that reaches the public
 * (presigning) S3 client.
 */
async function loadSignerWith(publicUrl: string | undefined) {
  jest.resetModules();
  if (publicUrl === undefined) {
    delete process.env.MINIO_PUBLIC_URL;
  } else {
    process.env.MINIO_PUBLIC_URL = publicUrl;
  }
  const mod = await import('../../src/services/StorageService.js');
  return mod.signMinioUrl;
}

/** The validator only runs on a URL that actually parses to an S3 location. */
const OBJECT_URL = 's3://las-flores/portraits/adeyemi_ogunbiyi/default.png';

beforeEach(() => {
  process.env.MINIO_ENDPOINT = 'minio';
});

afterAll(() => {
  if (ORIGINAL_PUBLIC_URL === undefined) delete process.env.MINIO_PUBLIC_URL;
  else process.env.MINIO_PUBLIC_URL = ORIGINAL_PUBLIC_URL;
  if (ORIGINAL_ENDPOINT === undefined) delete process.env.MINIO_ENDPOINT;
  else process.env.MINIO_ENDPOINT = ORIGINAL_ENDPOINT;
});

describe('MINIO_PUBLIC_URL validation for presigned URLs', () => {
  describe('rejects insecure public endpoints', () => {
    test.each([
      ['a routable hostname', 'http://cdn.example.com'],
      ['a public IP', 'http://203.0.113.10:9000'],
      // Not loopback: 10.x is routable within a LAN, so signed credentials
      // would still cross the wire in cleartext.
      ['a private LAN address', 'http://10.0.0.5:9000'],
      // Looks loopback-ish but is a distinct routable host.
      ['a host merely prefixed with "localhost"', 'http://localhost.evil.com'],
    ])('throws for %s', async (_label, publicUrl) => {
      const signMinioUrl = await loadSignerWith(publicUrl);

      await expect(signMinioUrl(OBJECT_URL)).rejects.toThrow(/insecure http:/i);
    });

    test('names the offending value and the https: requirement', async () => {
      const signMinioUrl = await loadSignerWith('http://cdn.example.com');

      // The message is the only signal an operator gets on a misconfigured
      // deploy, so it must carry the bad value rather than a bare failure.
      await expect(signMinioUrl(OBJECT_URL)).rejects.toThrow(/http:\/\/cdn\.example\.com/);
      await expect(signMinioUrl(OBJECT_URL)).rejects.toThrow(/https:/);
    });
  });

  describe('allows secure and local-development endpoints', () => {
    test.each([
      ['https on a routable host', 'https://cdn.example.com'],
      ['https with a port', 'https://cdn.example.com:9000'],
      ['http on localhost', 'http://localhost:9000'],
      ['http on 127.0.0.1', 'http://127.0.0.1:9000'],
      ['http on IPv6 loopback', 'http://[::1]:9000'],
      // Trailing slashes are stripped before the endpoint is built.
      ['a trailing slash', 'https://cdn.example.com/'],
    ])('signs with %s', async (_label, publicUrl) => {
      const signMinioUrl = await loadSignerWith(publicUrl);

      const signed = await signMinioUrl(OBJECT_URL);

      const expectedOrigin = new URL(publicUrl).origin;
      expect(signed.startsWith(expectedOrigin)).toBe(true);
      // A presigned URL, not the raw s3:// input passed through.
      expect(signed).toContain('X-Amz-Signature');
    });

    test('falls back to MINIO_ENDPOINT when no public URL is set', async () => {
      const signMinioUrl = await loadSignerWith(undefined);

      const signed = await signMinioUrl(OBJECT_URL);

      // Legacy behavior: sign against the internal endpoint. That host is not
      // browser-reachable, but it is also not a new cleartext exposure, so the
      // scheme guard deliberately does not apply here.
      expect(signed).toContain('minio');
      expect(signed).toContain('X-Amz-Signature');
    });
  });

  describe('rejects malformed public endpoints', () => {
    test.each([
      ['a bare hostname with no scheme', 'cdn.example.com'],
      ['a nonsense value', 'not a url'],
    ])('throws a configuration error for %s', async (_label, publicUrl) => {
      const signMinioUrl = await loadSignerWith(publicUrl);

      // Fail loudly at signing time rather than silently emitting URLs the
      // browser cannot use.
      await expect(signMinioUrl(OBJECT_URL)).rejects.toThrow(/not a valid URL/i);
    });
  });

  test('signs concurrently with a shared public-URL origin', async () => {
    const signMinioUrl = await loadSignerWith('https://cdn.example.com');

    const [first, second] = await Promise.all([
      signMinioUrl(OBJECT_URL),
      signMinioUrl(OBJECT_URL),
    ]);

    expect(new URL(first).origin).toBe('https://cdn.example.com');
    expect(new URL(second).origin).toBe('https://cdn.example.com');
  });
});
