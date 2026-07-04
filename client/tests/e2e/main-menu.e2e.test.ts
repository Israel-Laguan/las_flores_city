import { test, expect } from '@playwright/test';

const AUTH_BASE = process.env.API_URL ?? 'http://localhost:3000';
const ABOUT_US_URL = 'https://example.com/about-us';

test.describe('Main menu — normal operations', () => {
  test('dev login button is visible on the login page in dev mode', async ({ page }) => {
    await page.goto('/');
    const devBtn = page.locator('.login-btn-dev');
    await expect(devBtn).toBeVisible();
  });

  test.describe('About Us button', () => {
    test('main menu shows ABOUT US button after login', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/api/auth/dev-login`);
      await page.goto('/main');
      const aboutBtn = page.locator('.menu-btn[data-action="about"]');
      await expect(aboutBtn).toBeVisible();
      await expect(aboutBtn).toHaveText(/about us/i);
    });

    test('clicking ABOUT US opens the configured URL in a new tab', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/api/auth/dev-login`);
      await page.goto('/main');

      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('.menu-btn[data-action="about"]').click(),
      ]);

      expect(popup.url()).toBe(ABOUT_US_URL);
    });

    test('clicking ABOUT US opens exactly one tab even after navigating away and back', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/api/auth/dev-login`);
      await page.goto('/main');

      for (let i = 0; i < 3; i++) {
        await page.locator('.menu-btn[data-action="settings"]').click();
        await page.locator('.view-back-btn[data-action="back"]').click();
        await page.locator('.menu-btn[data-action="about"]').waitFor();
      }

      // Track window.open calls by wrapping it in the page context
      await page.evaluate(() => {
        (window as any)._lasFlores_openCallCount = 0;
        const originalOpen = window.open;
        window.open = function(...args: any[]) {
          (window as any)._lasFlores_openCallCount++;
          return originalOpen.apply(this, args);
        };
      });

      const initialCallCount = await page.evaluate(() => {
        return (window as any)._lasFlores_openCallCount || 0;
      });

      await page.locator('.menu-btn[data-action="about"]').click();

      await page.waitForTimeout(200);

      const finalCallCount = await page.evaluate(() => {
        return (window as any)._lasFlores_openCallCount || 0;
      });

      expect(finalCallCount - initialCallCount).toBe(1);
    });
  });
});
