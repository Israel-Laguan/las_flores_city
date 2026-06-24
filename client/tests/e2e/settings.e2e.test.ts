import { test, expect } from '@playwright/test';

const AUTH_BASE = '/api';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

test.describe('Settings — Display Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post(`${AUTH_BASE}/auth/dev-login`);
    await page.goto('/main');
    await page.locator('.menu-btn[data-action="settings"]').click();
    await page.locator('.display-name-input').waitFor({ state: 'visible' });
    // Wait for async loadSettings to populate the input
    await expect(page.locator('.display-name-input')).not.toHaveValue('');
  });

  test('shows current display name as reference text and pre-populates input', async ({ page }) => {
    await expect(page.locator('.current-display-name')).toBeVisible();
    await expect(page.locator('.current-display-name')).not.toBeEmpty();
    await expect(page.locator('.display-name-input')).toHaveValue(/dev/i);
  });

  test('saving a new display name shows saved status', async ({ page }) => {
    await page.locator('.display-name-input').fill('E2E Updated Name');
    await page.locator('button[data-action="save-display-name"]').click();
    await expect(page.locator('.display-name-status')).toContainText('SAVED');
  });

  test('shows error when saving empty display name', async ({ page }) => {
    await page.locator('.display-name-input').fill('');
    await page.locator('button[data-action="save-display-name"]').click();
    await expect(page.locator('.display-name-status')).toContainText('Display name cannot be empty');
  });

  test('persists display name across page navigation', async ({ page }) => {
    const uniqueName = `Unique-${uid()}`;
    await page.locator('.display-name-input').fill(uniqueName);
    await page.locator('button[data-action="save-display-name"]').click();
    await expect(page.locator('.display-name-status')).toContainText('SAVED');

    await page.locator('.view-back-btn[data-action="back"]').click();
    await page.locator('.menu-btn[data-action="settings"]').click();
    await page.locator('.display-name-input').waitFor({ state: 'visible' });
    await expect(page.locator('.display-name-input')).not.toHaveValue('');

    await expect(page.locator('.current-display-name')).toContainText(uniqueName);
  });
});

test.describe('Settings — Password Change', () => {
  const testEmail = `pw-e2e-${uid()}@example.com`;
  const testUsername = `pw_e2e_${uid()}`;
  const testPassword = 'SettingsPass1!';

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.request.post(`${AUTH_BASE}/auth/register`, {
      data: { email: testEmail, username: testUsername, display_name: 'E2E Password User', password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    await ctx.close();
  });

  async function loginAndGoToSettings(page: any, password: string): Promise<void> {
    const res = await page.request.post(`${AUTH_BASE}/auth/login`, {
      data: { email: testEmail, password },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto('/main');
    await page.locator('.menu-btn[data-action="settings"]').click();
    await page.locator('.current-password-input').waitFor({ state: 'visible' });
    // Wait for async loadSettings to complete (event listeners attached)
    await expect(page.locator('.current-display-name')).not.toBeEmpty();
  }

  test('shows error when both password fields are empty', async ({ page }) => {
    await loginAndGoToSettings(page, testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Both password fields are required');
  });

  test('shows error for short new password', async ({ page }) => {
    await loginAndGoToSettings(page, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill('12345');
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Password must be at least 6 characters');
  });

  test('shows error for wrong current password', async ({ page }) => {
    await loginAndGoToSettings(page, testPassword);
    await page.locator('.current-password-input').fill('WrongPassword1!');
    await page.locator('.new-password-input').fill('NewPass123!');
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Current password is incorrect');
  });

  test('changes password successfully and clears inputs', async ({ page }) => {
    await loginAndGoToSettings(page, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill('NewSettingsPass2!');
    await page.locator('button[data-action="change-password"]').click();

    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
    await expect(page.locator('.current-password-input')).toHaveValue('');
    await expect(page.locator('.new-password-input')).toHaveValue('');

    // Reset password back so other tests in this describe can login
    await loginAndGoToSettings(page, 'NewSettingsPass2!');
    await page.locator('.current-password-input').fill('NewSettingsPass2!');
    await page.locator('.new-password-input').fill(testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
  });

  test('works after re-login with new password', async ({ page }) => {
    // This test is fully self-contained: change password, re-login, change back
    await loginAndGoToSettings(page, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill('NewSettingsPass3!');
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');

    await page.locator('.view-back-btn[data-action="back"]').click();
    await loginAndGoToSettings(page, 'NewSettingsPass3!');

    await page.locator('.current-password-input').fill('NewSettingsPass3!');
    await page.locator('.new-password-input').fill(testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
  });
});
