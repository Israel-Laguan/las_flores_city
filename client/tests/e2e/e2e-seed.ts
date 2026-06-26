import { APIRequestContext } from '@playwright/test';

// API base URL: use full backend URL in CI, local proxy in dev
const API_BASE = process.env.API_URL ?? process.env.VITE_API_URL ?? (process.env.CI 
  ? 'http://localhost:3000'  // Direct to backend in CI
  : 'http://localhost:5173'); // Local dev with Vite proxy

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
