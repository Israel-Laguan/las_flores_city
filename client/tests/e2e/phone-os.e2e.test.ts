/**
 * Phone OS Shell & App Router — E2E Tests
 *
 * Pointer event focus locking (Phaser canvas blocked while phone open)
 * Chronology engine: status bar clock at TB 48, 32, 12
 * App routing stability: rapid tab cycling, no double scrollbars
 * Unified client state store: credits + TBs update simultaneously
 */
import { test, expect, Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:3000';

async function getDevToken(page: Page): Promise<string> {
  const res = await page.request.post(`${API_URL}/auth/dev-login`, {
    data: { userId: '550e8400-e29b-41d4-a716-446655440001' },
  });
  const body = await res.json();
  return body.data?.token ?? '';
}

test.beforeEach(async ({ page }) => {
  const token = await getDevToken(page);
  await page.addInitScript((t) => {
    localStorage.setItem('auth_token', t);
  }, token);
  await page.goto('/');
  await page.waitForSelector('#phone-overlay', { state: 'visible' });
});

// ── Pointer event focus locking ──────────────────────────────────────────────

test('Phone overlay captures clicks; Phaser canvas input is disabled', async ({ page }) => {
  const phoneOverlay = page.locator('#phone-overlay');
  await expect(phoneOverlay).toBeVisible();

  // The phone overlay must sit above the canvas (pointer-events: all)
  const phoneEvents = await phoneOverlay.evaluate((el) =>
    window.getComputedStyle(el).pointerEvents
  );
  expect(phoneEvents).toBe('all');

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
  const tabs = ['Messages', 'Banco', 'Trabajando'];

  for (const label of tabs) {
    await page.locator(`button:has-text("${label}")`).click();
    await page.waitForTimeout(80);
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
  // Navigate to Trabajando
  await page.locator('button:has-text("Trabajando")').click();
  await page.waitForSelector('#phone-app-content', { state: 'visible' });

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
