import { test, expect, Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

test.describe('M52 Story Builder full flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('login → Story Builder describe → intake → review → approve → solidify', async ({ page }) => {
    // Navigate to Story Builder
    await page.goto('/story-builder');
    await expect(page.locator('h1')).toContainText('Story Builder');

    // Describe step: enter a description and generate
    await page.fill('textarea[name="description"]', 'Create a new detective named Alice in City Center');
    await page.keyboard.press('Enter');
    await expect(page.locator('.step-indicator')).toContainText('Review');

    // Review step: plan should be loaded
    await expect(page.locator('.review-step')).toBeVisible({ timeout: 10_000 });

    // Approve & Ship
    await page.click('button:has-text("Approve & Ship")');
    await expect(page.locator('.results-step')).toBeVisible({ timeout: 10_000 });

    // Results step should show solidified status
    await expect(page.locator('.solidify-result')).toContainText('solidified');
  });
});
