import { APIRequestContext } from '@playwright/test';

// API base URL: use full backend URL in CI, local proxy in dev
const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Register a fresh E2E user, retrying on transient server-side failures.
 *
 * The dev server's OLTP connection pool can be saturated during the e2e
 * cold-start burst (dozens of beforeAlls firing at once), causing
 * /api/auth/register to return 500 with "Connection terminated due to
 * connection timeout". A single fail-fast register in beforeAll would abort
 * the entire spec file (and its sibling tests). This helper retries with
 * short backoff so a transient pool hiccup doesn't nuke a whole file.
 *
 * Retry policy:
 *  - Retries for a few seconds on 5xx or network-level failures.
 *  - Treats 409 (user already exists — leftover from a lost response on an
 *    earlier attempt of the same run) as success, since the email is unique
 *    per run.
 *  - Throws on other 4xx (a real test bug) without retrying.
 */
export async function registerE2EUser(
  request: APIRequestContext,
  opts: { email: string; username: string; display_name: string; password: string }
): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Awaited<ReturnType<APIRequestContext['post']>>;
    try {
      response = await request.post(`${API_BASE}/api/auth/register`, { data: opts });
    } catch (err) {
      // Network-level failure (proxy/connection). Retry.
      if (attempt === maxAttempts) throw err;
      console.warn(`registerE2EUser connection error (${attempt}/${maxAttempts}), retrying`);
      await sleep(150 * attempt);
      continue;
    }

    if (response.ok() || response.status() === 409) {
      return;
    }
    // 4xx — real test bug, don't retry.
    if (response.status() < 500) {
      throw new Error(`registerE2EUser failed: ${response.status()} ${await response.text()}`);
    }
    // 5xx — transient pool saturation; back off and retry.
    if (attempt === maxAttempts) {
      throw new Error(
        `registerE2EUser failed after ${maxAttempts} attempts (last=${response.status()}): ${await response.text()}`
      );
    }
    console.warn(`registerE2EUser transient ${response.status()} (${attempt}/${maxAttempts}), retrying in ${150 * attempt}ms`);
    await sleep(150 * attempt);
  }
  throw new Error('registerE2EUser unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Authenticate the request context's cookie jar by logging in.
 * Playwright's `request` fixture clears cookies between test phases
 * (beforeAll → test → afterAll), so login must be called in the same
 * phase as the subsequent seed/cleanup operation.
 */
async function login(request: APIRequestContext, email: string, password: string): Promise<void> {
  const response = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()}`);
  }
}

/**
 * Seed vault items and an NPC SMS thread for the authenticated user.
 * Logs in first using the provided credentials.
 */
export async function seedE2EUser(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  await login(request, email, password);

  const response = await request.post(`${API_BASE}/api/dev/seed`);
  if (!response.ok()) {
    const body = await response.json();
    throw new Error(`seedE2EUser failed: ${response.status()} ${JSON.stringify(body)}`);
  }
}

/**
 * Remove seeded vault items and SMS threads for the authenticated user.
 * Logs in first using the provided credentials.
 * Does NOT delete the user or player_states.
 */
export async function cleanupE2EUser(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  await login(request, email, password);

  const response = await request.post(`${API_BASE}/api/dev/cleanup`);
  if (!response.ok()) {
    const body = await response.json();
    throw new Error(`cleanupE2EUser failed: ${response.status()} ${JSON.stringify(body)}`);
  }
}
