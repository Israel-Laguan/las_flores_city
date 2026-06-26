import { test, expect } from '@playwright/test';

// API base URL: use full backend URL in CI, local proxy in dev
const AUTH_BASE = process.env.CI 
  ? 'http://localhost:3000'  // Direct to backend in CI
  : '/api';                   // Vite proxy in local dev
const ABOUT_US_URL = 'https://example.com/about-us';

test.describe('Main menu — normal operations', () => {
  test('dev login button is visible on the login page in dev mode', async ({ page }) => {
    await page.goto('/');
    const devBtn = page.locator('.login-btn-dev');
    await expect(devBtn).toBeVisible();
  });

  test.describe('About Us button', () => {
    test('main menu shows ABOUT US button after login', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/auth/dev-login`);
      await page.goto('/main');
      const aboutBtn = page.locator('.menu-btn[data-action="about"]');
      await expect(aboutBtn).toBeVisible();
      await expect(aboutBtn).toHaveText(/about us/i);
    });

    test('clicking ABOUT US opens the configured URL in a new tab', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/auth/dev-login`);
      await page.goto('/main');

      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('.menu-btn[data-action="about"]').click(),
      ]);

      expect(popup.url()).toBe(ABOUT_US_URL);
    });

    test('clicking ABOUT US opens exactly one tab even after navigating away and back', async ({ page }) => {
      await page.request.post(`${AUTH_BASE}/auth/dev-login`);
      await page.goto('/main');

      for (let i = 0; i < 3; i++) {
        await page.locator('.menu-btn[data-action="settings"]').click();
        await page.locator('.view-back-btn[data-action="back"]').click();
        await page.locator('.menu-btn[data-action="about"]').waitFor();
      }

      let popupCount = 0;
      page.on('popup', () => popupCount++);

      await page.locator('.menu-btn[data-action="about"]').click();

      await page.waitForTimeout(500);
      expect(popupCount).toBe(1);
    });
  });
});
