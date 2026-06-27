import { test, expect } from '@playwright/test';

const AUTH_BASE = process.env.API_URL ?? 'http://localhost:5173';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

test.describe('Settings — Display Name', () => {
  const testPassword = 'DisplayPass1!';

  async function createUser(page: any): Promise<string> {
    const email = `dn-e2e-${uid()}@example.com`;
    const username = `dn_e2e_${uid()}`;
    const res = await page.request.post(`${AUTH_BASE}/api/auth/register`, {
      data: { email, username, display_name: 'E2E Display User', password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    return email;
  }

  async function loginAndGoToSettings(page: any, email: string): Promise<void> {
    const res = await page.request.post(`${AUTH_BASE}/api/auth/login`, {
      data: { email, password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto('/main');
    await page.locator('.menu-btn[data-action="settings"]').click();
    await page.locator('.display-name-input').waitFor({ state: 'visible' });
    await expect(page.locator('.display-name-input')).not.toHaveValue('');
  }

  test('shows current display name as reference text and pre-populates input', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email);
    await expect(page.locator('.current-display-name')).toBeVisible();
    await expect(page.locator('.current-display-name')).not.toBeEmpty();
    await expect(page.locator('.display-name-input')).toHaveValue(/display/i);
  });

  test('saving a new display name shows saved status', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email);
    await page.locator('.display-name-input').fill('E2E Updated Name');
    await page.locator('button[data-action="save-display-name"]').click();
    await expect(page.locator('.display-name-status')).toContainText('SAVED');
  });

  test('shows error when saving empty display name', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email);
    await page.locator('.display-name-input').fill('');
    await page.locator('button[data-action="save-display-name"]').click();
    await expect(page.locator('.display-name-status')).toContainText('Display name cannot be empty');
  });

  test('persists display name across page navigation', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email);
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
  const testPassword = 'SettingsPass1!';

  async function createUser(page: any): Promise<string> {
    const email = `pw-e2e-${uid()}@example.com`;
    const username = `pw_e2e_${uid()}`;
    const res = await page.request.post(`${AUTH_BASE}/api/auth/register`, {
      data: { email, username, display_name: 'E2E Password User', password: testPassword },
    });
    expect(res.ok()).toBeTruthy();
    return email;
  }

  async function loginAndGoToSettings(page: any, email: string, password: string): Promise<void> {
    const res = await page.request.post(`${AUTH_BASE}/api/auth/login`, {
      data: { email, password },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto('/main');
    await page.locator('.menu-btn[data-action="settings"]').click();
    await page.locator('.current-password-input').waitFor({ state: 'visible' });
    await expect(page.locator('.current-display-name')).not.toBeEmpty();
  }

  test('shows error when both password fields are empty', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email, testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Both password fields are required');
  });

  test('shows error for short new password', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill('12345');
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Password must be at least 6 characters');
  });

  test('shows error for wrong current password', async ({ page }) => {
    const email = await createUser(page);
    await loginAndGoToSettings(page, email, testPassword);
    await page.locator('.current-password-input').fill('WrongPassword1!');
    await page.locator('.new-password-input').fill('NewPass123!');
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('Current password is incorrect');
  });

  test('changes password successfully and clears inputs', async ({ page }) => {
    const email = await createUser(page);
    const newPassword = 'NewSettingsPass2!';
    await loginAndGoToSettings(page, email, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill(newPassword);
    await page.locator('button[data-action="change-password"]').click();

    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
    await expect(page.locator('.current-password-input')).toHaveValue('');
    await expect(page.locator('.new-password-input')).toHaveValue('');

    // Verify re-login with new password works
    await loginAndGoToSettings(page, email, newPassword);
    await page.locator('.current-password-input').fill(newPassword);
    await page.locator('.new-password-input').fill(testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
  });

  test('works after re-login with new password', async ({ page }) => {
    const email = await createUser(page);
    const newPassword = 'NewSettingsPass3!';
    await loginAndGoToSettings(page, email, testPassword);
    await page.locator('.current-password-input').fill(testPassword);
    await page.locator('.new-password-input').fill(newPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');

    await page.locator('.view-back-btn[data-action="back"]').click();
    await loginAndGoToSettings(page, email, newPassword);

    await page.locator('.current-password-input').fill(newPassword);
    await page.locator('.new-password-input').fill(testPassword);
    await page.locator('button[data-action="change-password"]').click();
    await expect(page.locator('.password-status')).toContainText('PASSWORD CHANGED');
  });
});
