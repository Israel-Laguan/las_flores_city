import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

test.describe('M52 Story Builder full flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('login → Story Builder describe → intake → review → approve → solidify', async ({ page }) => {
    await page.goto('/story-builder');
    await expect(page.locator('h1')).toContainText('Story Builder');

    // Describe step: enter a description and generate via button click
    const textarea = page.getByTestId('describe-textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Create a new detective named Alice in City Center');
    await page.getByTestId('generate-plan-btn').click();

    // Review step: plan should be synthesized from graph
    await expect(page.getByTestId('review-step')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('step-indicator')).toBeVisible();

    // Approve & Ship
    const approveBtn = page.getByRole('button', { name: /Approve & Ship/ });
    await expect(approveBtn).toBeEnabled({ timeout: 10_000 });
    await approveBtn.click();

    // Results step should appear (polling may take a moment)
    await expect(page.getByTestId('results-step')).toBeVisible({ timeout: 60_000 });
    // solidify-result is inside StatusBox; for async jobs it may show pending first, then verified
    await expect(page.getByTestId('solidify-result')).toBeVisible({ timeout: 10_000 });
  });
});
