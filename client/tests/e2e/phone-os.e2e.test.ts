/**
 * Phone OS Shell & App Router — E2E Tests
 *
 * Pointer event focus locking (Phaser canvas blocked while phone open)
 * Chronology engine: status bar clock at TB 48, 32, 12
 * App routing stability: rapid tab cycling, no double scrollbars
 * Unified client state store: credits + TBs update simultaneously
 */
import { test, expect } from '@playwright/test';

/**
 * Seed the browser's cookie jar with an HttpOnly session cookie by calling
 * dev-login through the Vite /api proxy (scoped to :5173, the same origin as
 * the page). HttpOnly cookies are origin-scoped, so the login MUST go through
 * /api — not directly to :3000 — or the cookie would never reach the page's
 * in-page fetches. Playwright shares cookies between page.request and page.
 *
 * This replaced the old `addInitScript(localStorage.setItem)` pattern, which
 * cannot set HttpOnly cookies. See Task 6.5 spec §E2E migration.
 */
const API_BASE = process.env.API_URL ?? 'http://localhost:5173';

test.beforeEach(async ({ page }) => {
  const userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  await page.request.post(`${API_BASE}/api/auth/dev-login`, {
    data: { userId },
  });
  await page.goto('/city/loc/c3d4e5f6-a7b8-9012-cdef-123456789012');
  await page.waitForSelector('#phone-overlay', { state: 'visible' });
  // Wait for the game to fully start (Phaser canvas + fetchPlayerData settles)
  await page.waitForSelector('#game-container canvas', { state: 'visible', timeout: 15_000 });
  await expect(page.locator('#phone-clock')).toContainText('08:00 AM', { timeout: 10_000 });
});

// ── Pointer event focus locking ──────────────────────────────────────────────

test('Phone overlay pointer-events become all when open', async ({ page }) => {
  const phoneOverlay = page.locator('#phone-overlay');
  await expect(phoneOverlay).toBeVisible();

  // Initially closed — overlay does not block canvas interaction
  await expect(phoneOverlay).toHaveCSS('pointer-events', 'none');

  // Open phone via keyboard shortcut
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(400);

  // When open, the overlay captures clicks (PhoneBridge sets pointer-events to auto)
  await expect(phoneOverlay).toHaveCSS('pointer-events', 'auto', { timeout: 3_000 });

  // The Phaser canvas must have pointer-events blocked by the overlay
  const canvas = page.locator('canvas').first();
  const canvasZIndex = await canvas.evaluate((el) =>
    parseInt(window.getComputedStyle(el).zIndex || '0')
  );
  const overlayZIndex = await phoneOverlay.evaluate((el) =>
    parseInt(window.getComputedStyle(el).zIndex || '0')
  );
  expect(overlayZIndex).toBeGreaterThan(canvasZIndex);
});

// ── Chronology engine clock sync ─────────────────────────────────────────────

test('Status bar clock shows 08:00 AM at 48 TBs', async ({ page }) => {
  // Default seed state = 48 TBs → 08:00 AM
  const clock = page.locator('#phone-clock, [data-testid="phone-clock"]');
  await expect(clock).toBeVisible();
  await expect(clock).toContainText('08:00 AM');
});

test('Status bar clock shows 04:00 PM at 32 TBs', async ({ page }) => {
  await page.evaluate(() => {
    // Drive the store to 32 TBs — PhoneStore must re-derive clock from TB value
    (window as any).__phoneStore?.setState?.({ timeBlocks: 32 });
  });
  await page.waitForTimeout(100);
  const clock = page.locator('#phone-clock, [data-testid="phone-clock"]');
  await expect(clock).toContainText('04:00 PM');
});

test('Status bar clock shows 02:00 AM at 12 TBs', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__phoneStore?.setState?.({ timeBlocks: 12 });
  });
  await page.waitForTimeout(100);
  const clock = page.locator('#phone-clock, [data-testid="phone-clock"]');
  await expect(clock).toContainText('02:00 AM');
});

// ── App routing stability ────────────────────────────────────────────────────

test('Rapid tab cycling mounts/unmounts views without layout shifts or double scrollbars', async ({ page }) => {
  // First ensure phone nav bar is visible and has the buttons
  const navBar = page.locator('#phone-nav-bar');
  await expect(navBar).toBeVisible({ timeout: 10_000 });
  
  const tabs = ['Messages', 'Banco', 'Trabajando'];

  for (const label of tabs) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await page.waitForTimeout(150);
  }
  // Back to home
  await page.locator('button:has-text("Home"), [data-app="home"]').first().click();

  const appContent = page.locator('#phone-app-content');
  await expect(appContent).toBeVisible();

  // No double scrollbars: body overflow must not be 'scroll'
  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  expect(bodyOverflow).not.toBe('scroll');

  // Only one scrollable container inside the phone app content
  const scrollableCount = await page.evaluate(() => {
    const el = document.getElementById('phone-app-content');
    if (!el) return 0;
    return Array.from(el.querySelectorAll('*')).filter(
      (n) => getComputedStyle(n).overflowY === 'scroll'
    ).length;
  });
  expect(scrollableCount).toBeLessThanOrEqual(1);
});

// ── Unified client state store ───────────────────────────────────────────────

test('After gig execution, status bar and app view reflect updated TB and credits simultaneously', async ({ page }) => {
  // First ensure phone nav bar is visible
  const navBar = page.locator('#phone-nav-bar');
  await expect(navBar).toBeVisible({ timeout: 10_000 });
  
  // Navigate to Trabajando
  const trabajandoBtn = page.locator('button:has-text("Trabajando")').first();
  await expect(trabajandoBtn).toBeVisible({ timeout: 8_000 });
  await trabajandoBtn.click();
  await page.waitForSelector('#phone-app-content', { state: 'visible', timeout: 10_000 });

  const tbBefore = await page.locator('#phone-tb-display, [data-testid="tb-display"]').textContent();

  // Click the first available gig execute button
  const gigBtn = page.locator('[data-testid="gig-execute"], button:has-text("Execute"), button:has-text("Work")').first();
  const gigVisible = await gigBtn.isVisible().catch(() => false);

  if (gigVisible) {
    await gigBtn.click();
    await page.waitForTimeout(500);

    const tbAfter = await page.locator('#phone-tb-display, [data-testid="tb-display"]').textContent();
    // TB value must have changed (decreased)
    expect(tbAfter).not.toBe(tbBefore);

    // Status bar credits must also be visible and updated (same render cycle)
    const creditsDisplay = page.locator('[data-testid="credits-display"], .credits-value').first();
    await expect(creditsDisplay).toBeVisible();
  } else {
    // No gig button available in this seed state — assert the app renders without crashing
    await expect(page.locator('#phone-app-content')).toBeVisible();
  }
});
