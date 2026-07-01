import { test, expect, Page } from '@playwright/test';
import { startNewGame } from './helpers';

const rand = Math.random().toString(36).slice(2, 8);
const testEmail = `overlay-${Date.now()}-${rand}@example.com`;
const testUsername = `overlay_${Date.now()}_${rand}`;

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: {
      email: testEmail,
      username: testUsername,
      display_name: 'Phone Overlay E2E',
      password: 'test1234',
    },
  });
  expect(res.ok()).toBeTruthy();
});

async function injectAuth(page: Page) {
  await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { email: testEmail, password: 'test1234' },
  });
}

test.describe('Phone OS Overlay', () => {
  test('Phone overlay is visible on page load', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const phoneOverlay = page.locator('#phone-overlay');
    await expect(phoneOverlay).toBeVisible();
  });

  test('Phone overlay has correct z-index (above Phaser canvas)', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const phoneOverlay = page.locator('#phone-overlay');
    const zIndex = await phoneOverlay.evaluate((el) => 
      window.getComputedStyle(el).zIndex
    );
    expect(parseInt(zIndex)).toBeGreaterThanOrEqual(1000);
  });

  test('Feed app tab is clickable and shows content', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const feedTab = page.locator('button:has-text("Feed")');
    await expect(feedTab).toBeVisible();
    await feedTab.click();
    
    const feedContent = page.locator('#phone-app-content');
    await expect(feedContent).toContainText('FEED');
  });

  test('Messages app tab is clickable and shows content', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const messagesTab = page.locator('button:has-text("Messages")');
    await expect(messagesTab).toBeVisible();
    await messagesTab.click();
    
    const messagesContent = page.locator('#phone-app-content');
    await expect(messagesContent).toContainText('MESSAGES');
  });

  test('Vault app tab is clickable and shows content', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const vaultTab = page.locator('button:has-text("Vault")');
    await expect(vaultTab).toBeVisible();
    await vaultTab.click();
    
    const vaultContent = page.locator('#phone-app-content');
    await expect(vaultContent).toContainText('THE VAULT');
    await expect(vaultContent).toContainText(/No files found in local storage|LOCAL ENCRYPTED STORAGE/);
  });

  test('Identity app tab is clickable and shows content', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const identityTab = page.locator('button:has-text("Identity")');
    await expect(identityTab).toBeVisible();
    await identityTab.click();
    
    const identityContent = page.locator('#phone-app-content');
    await expect(identityContent).toContainText('IDENTITY');
  });

  test('Time Blocks display shows TB balance', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const timeBlocksDisplay = page.locator('#phone-tb-display');
    await expect(timeBlocksDisplay).toBeVisible();
    await expect(timeBlocksDisplay).toContainText('TB:');
  });
});
