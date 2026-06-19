import { describe, test, expect } from '@jest/globals';
import { webcrypto, randomBytes } from 'node:crypto';

// ============================================================
// BYOK AES-GCM Round-Trip Unit Tests
//
// The client split-key crypto flow is:
//   1. Browser generates a 256-bit AES-GCM key.
//   2. Browser encrypts the API key with that AES key + random IV.
//   3. Browser stores the AES key locally and POSTs the ciphertext
//      + IV to the server.
//   4. On dialogue, the Web Worker pulls the ciphertext + IV back,
//      decrypts in memory, and uses the plaintext API key against
//      the LLM endpoint.
//
// These tests use Node 20+'s webcrypto to replay the same
// primitives. They prove the encryption contract: ciphertext +
// IV alone are useless without the local AES key, and the round
// trip recovers the original plaintext byte-for-byte.
// ============================================================

const subtle = webcrypto.subtle;

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

describe('BYOK AES-GCM split-key encryption', () => {
  test('round-trip: encrypt → store → fetch → decrypt recovers the API key', async () => {
    // 1. Generate the local AES key
    const localKey = await subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const localKeyRaw = new Uint8Array(await subtle.exportKey('raw', localKey));
    const localKeyBase64 = bytesToBase64(localKeyRaw);

    // 2. Encrypt the API key (player paste)
    const plainApiKey = 'sk-test-very-secret-do-not-leak-7421';
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      localKey,
      new TextEncoder().encode(plainApiKey)
    );
    const ciphertext = bytesToBase64(new Uint8Array(ciphertextBuf));
    const ivBase64 = bytesToBase64(iv);

    // 3. Simulate server-side: only ciphertext + iv are stored.
    //    Assert they do NOT contain the plaintext.
    expect(ciphertext).not.toContain('sk-test');
    expect(ciphertext).not.toContain('7421');
    expect(ivBase64).not.toContain('sk-test');

    // 4. Worker-side: import the local key and decrypt
    const reimportedKey = await subtle.importKey(
      'raw',
      base64ToBytes(localKeyBase64),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const recovered = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
      reimportedKey,
      base64ToBytes(ciphertext)
    );
    const recoveredText = new TextDecoder().decode(recovered);
    expect(recoveredText).toBe(plainApiKey);
  });

  test('wrong local key fails to decrypt (attacker model)', async () => {
    const realKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const attackerKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      realKey,
      new TextEncoder().encode('sk-real-secret')
    );

    // An attacker holding the ciphertext + iv (server breach) but
    // NOT the local key cannot decrypt.
    await expect(
      subtle.decrypt(
        { name: 'AES-GCM', iv },
        attackerKey,
        ciphertextBuf
      )
    ).rejects.toThrow();
  });

  test('different IV produces different ciphertext for the same plaintext', async () => {
    // AES-GCM with a 12-byte random IV should never reuse keystream
    // for the same plaintext. This is a property the route contract
    // relies on (every save = new IV).
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv1 = randomBytes(12);
    const iv2 = randomBytes(12);
    const plaintext = new TextEncoder().encode('sk-same-key');

    const c1 = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv1 }, key, plaintext));
    const c2 = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, key, plaintext));

    expect(bytesToBase64(c1)).not.toBe(bytesToBase64(c2));
  });

  test('ciphertext length is plaintext length + 16-byte GCM tag', async () => {
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('sk-length-test');
    const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    expect(ciphertext.length).toBe(plaintext.length + 16);
  });
});
