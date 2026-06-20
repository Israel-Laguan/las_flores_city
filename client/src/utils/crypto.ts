const LOCAL_KEY_STORAGE = 'ai_local_key';

export function getLocalKey(): string | null {
  return localStorage.getItem(LOCAL_KEY_STORAGE);
}

export function setLocalKey(key: string): void {
  localStorage.setItem(LOCAL_KEY_STORAGE, key);
}

export function clearLocalKey(): void {
  localStorage.removeItem(LOCAL_KEY_STORAGE);
}

export async function setupSplitKey(plainApiKey: string): Promise<void> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  const localKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(raw)));

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainApiKey);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const ciphertext = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  localStorage.setItem(LOCAL_KEY_STORAGE, localKeyBase64);

  // Auth is handled by HttpOnly cookie (credentials:'same-origin').
  const response = await fetch('/api/settings/ai-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ ciphertext, iv: ivBase64, enabled: true }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save AI key: ${response.status}`);
  }
}

export async function removeSplitKey(): Promise<void> {
  // Auth is handled by HttpOnly cookie (credentials:'same-origin').
  await fetch('/api/settings/ai-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ ciphertext: null, iv: null, enabled: false }),
  });
  clearLocalKey();
}
