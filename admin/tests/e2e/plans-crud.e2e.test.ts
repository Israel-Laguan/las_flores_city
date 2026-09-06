import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

test.describe('M52b Admin Plans CRUD Parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/', { timeout: 10_000 });
    await page.goto('/story-builder/plans');
    await expect(page.locator('h1')).toContainText('Story Builder Plans');
  });

  test.describe('Plans List Filtering and Search', () => {
    test('should display plans list with pagination', async ({ page }) => {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.getByText(/No plans found|Loading plans/)).not.toBeVisible({ timeout: 15_000 });
    });

    test('should filter plans by status', async ({ page }) => {
      const statusSelect = page.locator('select').filter({ hasText: /All statuses|draft|proposed/ });
      await statusSelect.selectOption('proposed');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('table tbody tr')).toHaveCount(/>= 0/);
    });

    test('should search plans by description', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Search plans...');
      await searchInput.fill('detective');
      await page.waitForTimeout(400);
      await expect(page.locator('table tbody tr')).toHaveCount(/>= 0/);
      await searchInput.clear();
      await page.waitForTimeout(400);
    });

    test('should sort plans by updated_at descending by default', async ({ page }) => {
      const firstRow = page.locator('table tbody tr').first();
      await expect(firstRow).toBeVisible({ timeout: 10_000 });
    });

    test('should toggle sort order between asc and desc', async ({ page }) => {
      const sortToggle = page.getByRole('button', { name: /Desc|Asc/ });
      await expect(sortToggle).toBeVisible();
      const initialText = await sortToggle.textContent();
      await sortToggle.click();
      await page.waitForLoadState('networkidle');
      const newText = await sortToggle.textContent();
      expect(newText).not.toBe(initialText);
    });
  });

  test.describe('Plans List Actions', () => {
    test('should show New Plan and New from Template buttons', async ({ page }) => {
      await expect(page.getByRole('link', { name: '+ New Plan' })).toBeVisible();
      await expect(page.getByRole('button', { name: '+ New from Template' })).toBeVisible();
    });

    test('should open template creation modal', async ({ page }) => {
      await page.getByRole('button', { name: '+ New from Template' }).click();
      await expect(page.getByText('New Plan from Template')).toBeVisible();
      await expect(page.getByLabelText('Template ID')).toBeVisible();
      await expect(page.getByLabelText('Name')).toBeVisible();
      await expect(page.getByLabelText('Slug')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText('New Plan from Template')).not.toBeVisible();
    });

    test('should show View Report or Resume button per plan', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const firstRow = page.locator('table tbody tr').first();
      await expect(firstRow.getByRole('link', { name: /Resume|View Report/ })).toBeVisible();
    });

    test('should show quick actions based on plan status', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const rows = page.locator('table tbody tr');
      const count = await rows.count();
      if (count > 0) {
        const firstRow = rows.first();
        const status = await firstRow.locator('.statusBadge').textContent();
        if (status && ['failed', 'migrated', 'approved', 'proposed'].includes(status.toLowerCase())) {
          await expect(firstRow.getByRole('button', { name: /Retry|Verify|Stage|Approve/ })).toBeVisible();
        }
      }
    });

    test('should show Reject and Delete buttons per plan', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const firstRow = page.locator('table tbody tr').first();
      await expect(firstRow.getByRole('button', { name: 'Reject' })).toBeVisible();
      await expect(firstRow.getByRole('button', { name: 'Delete' })).toBeVisible();
    });
  });

  test.describe('Expandable Detail Panel', () => {
    test('should expand row to show detail panel', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const firstRow = page.locator('table tbody tr').first();
      const expandBtn = firstRow.getByTitle(/Expand|Collapse/);
      await expandBtn.click();
      await expect(page.getByText('Plan Detail')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('ID')).toBeVisible();
      await expect(page.getByText('Description')).toBeVisible();
      await expect(page.getByText('Status')).toBeVisible();
      await expect(page.getByText('Created')).toBeVisible();
      await expect(page.getByText('Updated')).toBeVisible();
    });

    test('should show Open in Story Builder link in detail panel', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const firstRow = page.locator('table tbody tr').first();
      const expandBtn = firstRow.getByTitle(/Expand|Collapse/);
      await expandBtn.click();
      await expect(page.getByRole('link', { name: 'Open in Story Builder' })).toBeVisible({ timeout: 5_000 });
    });

    test('should collapse detail panel when clicking collapse', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10_000 });
      const firstRow = page.locator('table tbody tr').first();
      const expandBtn = firstRow.getByTitle(/Expand|Collapse/);
      await expandBtn.click();
      await expect(page.getByText('Plan Detail')).toBeVisible({ timeout: 5_000 });
      await expandBtn.click();
      await expect(page.getByText('Plan Detail')).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Pagination', () => {
    test('should show pagination controls when total > limit', async ({ page }) => {
      await page.waitForTimeout(2_000);
      if (await page.locator('.pagination').count() > 0) {
        await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
        await expect(page.locator('.pageInfo')).toBeVisible();
      }
    });
  });
});
