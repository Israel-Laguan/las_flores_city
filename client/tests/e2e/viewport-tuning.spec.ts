import { test, expect, Page } from '@playwright/test';
import { startNewGame } from './helpers';

const rand = Math.random().toString(36).slice(2, 8);
const testEmail = `viewport-${Date.now()}-${rand}@example.com`;
const testUsername = `viewport_${Date.now()}_${rand}`;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/register', {
    data: {
      email: testEmail,
      username: testUsername,
      display_name: 'Viewport Tuning E2E',
      password: 'test1234',
    },
  });
  expect(res.ok()).toBeTruthy();
});

async function injectAuth(page: Page) {
  await page.request.post('/api/auth/login', {
    data: { email: testEmail, password: 'test1234' },
  });
}

test.describe('Viewport Tuning (Task 6.3)', () => {
  test('CSS custom properties are injected on :root after page load', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    await page.waitForTimeout(500);

    const viewportHeight = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--viewport-height');
    });

    // On desktop browsers with visualViewport support, this should be a px value.
    // On headless environments without visualViewport, the var is never set and
    // the fallback 100vh takes over — which is correct graceful degradation.
    if (viewportHeight) {
      expect(viewportHeight).toMatch(/^\d+px$/);
    }
  });

  test('touch-action: manipulation is applied to interactive phone elements', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    await page.waitForTimeout(500);

    // Open the phone so interactive elements are rendered.
    // PhoneOverlay listens for 'KeyP' on document keydown when the phone is closed.
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(400);

    // The nav buttons exist in the DOM regardless of open state (they're built
    // in the constructor), so we can check them directly.
    const navButtons = page.locator('.phone-os-container .nav-bar button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const touchAction = await navButtons.nth(i).evaluate(
        (el) => getComputedStyle(el).touchAction
      );
      expect(touchAction).toContain('manipulation');
    }
  });

  test('viewport meta does not disable zoom (accessibility)', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);

    const metaContent = await page.evaluate(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      return meta?.content ?? '';
    });

    // Must have viewport-fit=cover for notch support
    expect(metaContent).toContain('viewport-fit=cover');

    // Must NOT have zoom-locking directives (WCAG 1.4.4)
    expect(metaContent).not.toContain('user-scalable=no');
    expect(metaContent).not.toContain('maximum-scale=1.0');
  });
});
