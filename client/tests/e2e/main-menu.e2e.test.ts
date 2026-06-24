import { test, expect } from '@playwright/test';

const AUTH_BASE = '/api';
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
  });
});
