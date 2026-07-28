import { Page, expect } from '@playwright/test';

/**
 * Wait until the Phaser game canvas is fully initialized.
 *
 * Playwright's `toBeVisible()` only confirms the <canvas> element exists and
 * has layout. Under parallel/CI load Phaser can still be booting its WebGL
 * context at that point, so clicking or inspecting the canvas races. This
 * helper additionally waits for a non-zero backing-store width, which Phaser
 * sets during `Phaser.Game` boot — a reliable signal that the canvas is ready
 * to receive input. Prefer this over fixed `page.waitForTimeout()` sleeps in
 * any test that depends on the Phaser canvas.
 */
export async function waitForGameCanvas(page: Page, timeout = 15_000): Promise<void> {
  const canvas = page.locator('#game-container canvas');
  await expect(canvas).toBeVisible({ timeout });

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const width = await canvas
      .evaluate((el) => (el as HTMLCanvasElement).width || 0)
      .catch(() => 0);
    if (width > 0) return;
    await page.waitForTimeout(200);
  }
  throw new Error(
    `Phaser canvas did not finish initializing within ${timeout}ms (canvas.width stayed 0)`,
  );
}

/**
 * Log in through the Vite /api proxy (scoped to the page origin, :5173) so the
 * HttpOnly session cookie lands in the page's cookie jar. Retries transient
 * non-2xx responses — under parallel/CI load the auth endpoint can briefly
 * return 5xx/timeout even though the account exists. Throws if every attempt
 * fails so callers fail loudly instead of proceeding unauthenticated (which
 * otherwise surfaces as a confusing downstream assertion failure).
 */
export async function login(
  page: Page,
  email: string,
  password: string,
  baseURL: string = process.env.API_URL ?? 'http://localhost:5173',
  retries = 3,
): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await page.request.post(`${baseURL}/api/auth/login`, {
      data: { email, password },
    });
    if (res.ok()) return;
    lastStatus = res.status();
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error(
    `login failed for ${email} after ${retries} attempts (last status ${lastStatus})`,
  );
}

/**
 * Navigate to a location route so the app boots the game world and Phaser
 * canvas. The page's cookie jar must already contain a valid session cookie
 * (set via login()/page.request.post('/api/auth/login') beforehand).
 *
 * Uses "The Apartment" scene ID which triggers Phaser to start via the
 * /city/loc/:id route handler. After navigation we wait for the canvas to be
 * fully initialized (see waitForGameCanvas) so callers can interact with the
 * game immediately without fixed sleeps — this is the explicit canvas-ready
 * guard that keeps Phaser-dependent tests stable under parallel/CI load.
 */
export async function startNewGame(
  page: Page,
  locationId = '1efcf23b-04b1-404c-bf8d-1aa15d11d213',
): Promise<void> {
  await page.goto(`/city/loc/${locationId}`);
  await waitForGameCanvas(page);
}
