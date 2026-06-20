/**
 * Auth Cookie Migration — E2E Test Suite (Task 6.5)
 *
 * Verifies the four invariants of the HttpOnly cookie auth migration:
 *
 *   1. Login/register no longer expose `token` in the response body.
 *   2. The server sets a `Set-Cookie: jwt_session=...; HttpOnly` header.
 *   3. A subsequent authenticated request succeeds using ONLY the cookie
 *      (no Authorization header) — proving the cookie reaches the middleware.
 *   4. Logout clears the session cookie, revoking access.
 *
 * IMPORTANT — origin scoping: HttpOnly cookies are scoped to the origin that
 * set them. The client app runs on the Vite dev server (baseURL :5173), and
 * all its in-page fetches go through the `/api` Vite proxy. So auth requests
 * in these tests MUST also go through `/api` (i.e. the :5173 proxy), NOT
 * directly to the API server on :3000 — otherwise the cookie would be scoped
 * to :3000 and never reach the page's fetches. Playwright shares cookies
 * between page.request and page, so a page.request.post('/api/auth/login')
 * seeds the browser cookie jar exactly like a real browser flow.
 */
import { test, expect } from '@playwright/test';

// baseURL is :5173 (the Vite dev server). We use relative /api paths so the
// HttpOnly cookie is scoped to :5173 — the same origin as the client app.
const AUTH_BASE = '/api';

const testEmail = `cookie-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const testUsername = `cookie_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ─────────────────────────────────────────────────────────────────────────────
// 1 & 2. Register response shape + Set-Cookie header
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth cookie — register & login shape', () => {
  test('register sets HttpOnly cookie and omits token from body', async ({ request }) => {
    const res = await request.post(`${AUTH_BASE}/auth/register`, {
      data: {
        email: testEmail,
        username: testUsername,
        display_name: 'Cookie E2E',
        password: 'test1234',
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // Invariant 1: no token in response body
    expect(body.data).toBeDefined();
    expect(body.data.token).toBeUndefined();

    // Invariant 2: Set-Cookie header present with HttpOnly + jwt_session
    const setCookie = res.headers()['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('jwt_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  test('login sets HttpOnly cookie and omits token from body', async ({ request, page }) => {
    // Login via the page's cookie jar so the cookie persists for follow-up
    // authenticated requests in the next test block.
    const res = await page.request.post(`${AUTH_BASE}/auth/login`, {
      data: { email: testEmail, password: 'test1234' },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.data).toBeDefined();
    expect(body.data.token).toBeUndefined();

    const setCookie = res.headers()['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('jwt_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Authenticated request works with cookie alone (no Authorization header)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth cookie — session propagation', () => {
  test('authenticated endpoint returns 200 with cookie only, no Authorization header', async ({ page }) => {
    // Seed the browser cookie jar via login. No addInitScript / localStorage.
    const loginRes = await page.request.post(`${AUTH_BASE}/auth/login`, {
      data: { email: testEmail, password: 'test1234' },
    });
    expect(loginRes.ok()).toBeTruthy();

    // The browser context now holds the HttpOnly cookie. A fetch from the
    // page (or another page.request call) automatically sends it. We do NOT
    // set an Authorization header — proving the cookie is the auth vector.
    const stateRes = await page.request.get(`${AUTH_BASE}/player/state`);

    expect(stateRes.ok()).toBeTruthy();
    const stateBody = await stateRes.json();
    expect(stateBody.success).toBe(true);
    expect(stateBody.data).toBeDefined();
  });

  test('client app boots and loads player state via cookie auth', async ({ page }) => {
    // Real browser flow: login via the server → navigate to app → app's own
    // fetch('/api/player/state') must succeed because the cookie rides along.
    const loginRes = await page.request.post(`${AUTH_BASE}/auth/login`, {
      data: { email: testEmail, password: 'test1234' },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto('/');

    // The client init flow (main.ts) calls getPlayerState() on boot. If the
    // cookie auth is broken, it would fall back to devLogin and emit a console
    // log about "No session cookie found". We assert that never happens.
    const sawNoCookieFallback: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('No session cookie found')) {
        sawNoCookieFallback.push(msg.text());
      }
    });

    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Give the init flow time to complete. If the cookie worked, the player
    // state loaded without the devLogin fallback.
    await page.waitForTimeout(2_000);
    expect(sawNoCookieFallback).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Logout clears the session cookie
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth cookie — logout', () => {
  test('logout clears the session cookie and revokes access', async ({ page }) => {
    // Establish a session.
    const loginRes = await page.request.post(`${AUTH_BASE}/auth/login`, {
      data: { email: testEmail, password: 'test1234' },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Confirm we are authenticated before logout.
    const beforeLogout = await page.request.get(`${AUTH_BASE}/player/state`);
    expect(beforeLogout.ok()).toBeTruthy();

    // Logout must return a Set-Cookie that clears jwt_session.
    const logoutRes = await page.request.post(`${AUTH_BASE}/auth/logout`);
    expect(logoutRes.ok()).toBeTruthy();
    const logoutBody = await logoutRes.json();
    expect(logoutBody.success).toBe(true);

    // The server's clearSessionCookie() emits a Set-Cookie with Max-Age=0 /
    // Expires in the past. The cookie jar updates, so the next request has
    // no session cookie and must be rejected (401/403, NOT 200).
    const afterLogout = await page.request.get(`${AUTH_BASE}/player/state`);
    expect(afterLogout.ok()).toBeFalsy();
    expect([401, 403]).toContain(afterLogout.status());
  });
});
