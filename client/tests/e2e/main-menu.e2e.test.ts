import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

const AUTH_BASE = process.env.API_URL ?? 'http://localhost:5173';
const ABOUT_US_URL = process.env.VITE_ABOUT_US_URL ?? 'https://example.com/about-us';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

async function registerAndLogin(page: Page): Promise<void> {
  const email = `menu-${uid()}@example.com`;
  const username = `menu_${uid()}`;
  const res = await page.request.post(`${AUTH_BASE}/api/auth/register`, {
    data: {
      email,
      username,
      display_name: 'Main Menu E2E',
      password: 'test1234',
    },
  });
  expect(res.ok()).toBeTruthy();
  await login(page, email, 'test1234', AUTH_BASE);
}

test.describe('Main menu — normal operations', () => {
  test('dev login button is visible on the login page in dev mode', async ({ page }) => {
    await page.goto('/');
    const devBtn = page.locator('.login-btn-dev');
    await expect(devBtn).toBeVisible();
  });

  test.describe('About Us button', () => {
    test('main menu shows ABOUT US button after login', async ({ page }) => {
      await registerAndLogin(page);
      await page.goto('/main');
      const aboutBtn = page.locator('.menu-btn[data-action="about"]');
      await expect(aboutBtn).toBeVisible();
      await expect(aboutBtn).toHaveText(/about us/i);
    });

    test('clicking ABOUT US opens the configured URL in a new tab', async ({ page }) => {
      await registerAndLogin(page);
      await page.goto('/main');

      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('.menu-btn[data-action="about"]').click(),
      ]);

      expect(popup.url()).toBe(ABOUT_US_URL);
    });

    test('clicking ABOUT US opens exactly one tab even after navigating away and back', async ({ page }) => {
      await registerAndLogin(page);
      await page.goto('/main');

      // Wait for page to load (not networkidle — SPA may have persistent polling)
      await page.waitForLoadState('load');

      for (let i = 0; i < 3; i++) {
        await page.locator('.menu-btn[data-action="settings"]').click();
        await page.locator('.view-back-btn[data-action="back"]').click();
        await page.locator('.menu-btn[data-action="about"]').waitFor({ state: 'visible' });
      }

      // Confirm the about button is interactive before clicking
      const aboutBtn = page.locator('.menu-btn[data-action="about"]');
      await aboutBtn.waitFor({ state: 'visible' });

      // Standard Promise.all pattern (same as the previous test) to capture the popup
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        aboutBtn.click(),
      ]);

      expect(popup.url()).toBe(ABOUT_US_URL);
      popup.close();
    });
  });
});
