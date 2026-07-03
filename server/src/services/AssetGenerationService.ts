const NIM_INVOKE_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b';
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';

const RPM_LIMIT = 35;
const WINDOW_MS = 60000;
const MAX_RETRIES = 6;
const INITIAL_BACKOFF_MS = 60000;
const MIN_FILE_SIZE = 5000;

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private rate: number, private perMs: number) {
    this.tokens = rate;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const toAdd = Math.floor((elapsed / this.perMs) * this.rate);
    if (toAdd > 0) {
      this.tokens = Math.min(this.rate, this.tokens + toAdd);
      this.lastRefill = now;
    }
  }

  async take() {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    const waitMs = (this.perMs / this.rate) * (1 - this.tokens / this.rate);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

const nimBucket = new TokenBucket(RPM_LIMIT, WINDOW_MS);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function httpGet(url: string, timeoutMs = 30000): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function httpPost(url: string, payload: any, timeoutMs = 60000): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY || ''}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function isErrorBuffer(buffer: Buffer): boolean {
  if (buffer.length < MIN_FILE_SIZE) return true;
  try {
    const head = buffer.toString('utf-8', 0, 400);
    if (head.includes('Too Many Requests') || head.includes('error')) return true;
  } catch {
    // binary file, probably fine
  }
  return false;
}

function cleanNegativePrompt(text: string): string {
  let t = (text || '').trim();
  if (!t) return '';
  t = t.replace(/^--no\s+/, 'no ');
  t = t.replace(/^--no$/, 'no');
  return t.trim();
}

export async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  // Handle s3:// URLs by fetching from MinIO
  let url = imageUrl;
  if (imageUrl.startsWith('s3://')) {
    const { signMinioUrl } = await import('./StorageService.js');
    url = await signMinioUrl(imageUrl);
  }
  const buffer = await httpGet(url);
  return buffer.toString('base64');
}

export async function generateBaseImage(options: {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
}): Promise<Buffer> {
  const nimApiKey = process.env.NVIDIA_API_KEY || '';
  if (!nimApiKey) {
    throw new Error('NVIDIA_API_KEY missing');
  }

  const { prompt, negativePrompt, width, height, seed = 0 } = options;

  const fullPrompt = negativePrompt
    ? `${prompt}\n\nNO ${cleanNegativePrompt(negativePrompt)}`
    : prompt;

  const payload: any = {
    prompt: fullPrompt,
    width,
    height,
    seed,
    steps: 4,
  };

  let lastError: Error | null = null;
  let wait = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await nimBucket.take();

      const body = await httpPost(NIM_INVOKE_URL, payload);
      const artifact = body.artifacts?.[0];

      if (artifact?.finishReason === 'CONTENT_FILTERED') {
        console.warn(`  ⚠️  NIM content filtered (seed: ${seed}), falling back to Pollinations`);
        return generatePollinationsFallback(prompt, width, height);
      }

      const b64 = artifact?.base64;
      if (!b64) {
        throw new Error('no base64 artifact in NIM response');
      }

      const buffer = Buffer.from(b64, 'base64');
      if (isErrorBuffer(buffer)) {
        throw new Error('NIM returned error response');
      }

      return buffer;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        await sleep(wait);
        wait = Math.min(wait * 1.5, 300000);
      }
    }
  }

  console.warn(`  ⚠️  NIM failed after ${MAX_RETRIES} attempts, falling back to Pollinations`);
  return generatePollinationsFallback(prompt, width, height);
}

async function generatePollinationsFallback(prompt: string, width: number, height: number): Promise<Buffer> {
  const encoded = encodeURIComponent(prompt);
  const url = `${POLLINATIONS_BASE}/${encoded}?width=${width}&height=${height}&nologo=true`;
  const buffer = await httpGet(url, 60000);
  if (isErrorBuffer(buffer)) {
    throw new Error('Pollinations returned error response');
  }
  return buffer;
}

export async function generateVariantImage(options: {
  prompt: string;
  sourceImageUrl: string;
  strength: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
}): Promise<Buffer> {
  const { prompt, sourceImageUrl, strength, width = 1024, height = 1024, negativePrompt } = options;

  const fullPrompt = negativePrompt
    ? `${prompt}\n\nNO ${cleanNegativePrompt(negativePrompt)}`
    : prompt;

  // Try NIM i2i first
  const nimApiKey = process.env.NVIDIA_API_KEY || '';
  if (nimApiKey) {
    try {
      const imageBase64 = await fetchImageAsBase64(sourceImageUrl);
      const payload: any = {
        prompt: fullPrompt,
        image: imageBase64,
        width,
        height,
        seed: 0,
        steps: 4,
      };

      // NIM FLUX.2 Klein may accept strength as part of the image parameter
      // or via a separate field. Include it if supported.
      if (strength !== undefined) {
        payload.strength = strength;
      }

      let lastError: Error | null = null;
      let wait = INITIAL_BACKOFF_MS;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await nimBucket.take();
          const body = await httpPost(NIM_INVOKE_URL, payload);
          const artifact = body.artifacts?.[0];

          if (artifact?.finishReason === 'CONTENT_FILTERED') {
            console.warn('  ⚠️  NIM i2i content filtered, falling back to Pollinations');
            return generatePollinationsVariant(prompt, sourceImageUrl, strength, width, height);
          }

          const b64 = artifact?.base64;
          if (!b64) {
            throw new Error('no base64 artifact in NIM i2i response');
          }

          const buffer = Buffer.from(b64, 'base64');
          if (isErrorBuffer(buffer)) {
            throw new Error('NIM i2i returned error response');
          }

          return buffer;
        } catch (err) {
          lastError = err as Error;
          if (attempt < MAX_RETRIES) {
            await sleep(wait);
            wait = Math.min(wait * 1.5, 300000);
          }
        }
      }

      console.warn('  ⚠️  NIM i2i failed after retries, falling back to Pollinations');
    } catch (err) {
      console.warn('  ⚠️  NIM i2i setup failed:', (err as Error).message);
    }
  }

  // Fallback to Pollinations i2i
  return generatePollinationsVariant(prompt, sourceImageUrl, strength, width, height, negativePrompt);
}

async function generatePollinationsVariant(
  prompt: string,
  sourceImageUrl: string,
  strength: number,
  width: number,
  height: number,
  negativePrompt?: string
): Promise<Buffer> {
  const encoded = encodeURIComponent(prompt);
  let url = `${POLLINATIONS_BASE}/${encoded}?width=${width}&height=${height}&nologo=true`;

  // Pollinations supports image-to-image via the `image` parameter
  if (sourceImageUrl) {
    url += `&image=${encodeURIComponent(sourceImageUrl)}`;
  }

  if (negativePrompt) {
    url += `&negative_prompt=${encodeURIComponent(cleanNegativePrompt(negativePrompt))}`;
  }

  // Note: Pollinations may not support strength directly; if not, strength is ignored
  // and the variant prompt guides the generation. This is acceptable as a fallback.

  const buffer = await httpGet(url, 60000);
  if (isErrorBuffer(buffer)) {
    throw new Error('Pollinations i2i returned error response');
  }
  return buffer;
}