import { test, expect } from '@playwright/test';

test.describe('Phone OS Overlay', () => {
  test('Phone overlay is visible on page load', async ({ page }) => {
    await page.goto('/');
    
    const phoneOverlay = page.locator('#phone-overlay');
    await expect(phoneOverlay).toBeVisible();
  });

  test('Phone overlay has correct z-index (above Phaser canvas)', async ({ page }) => {
    await page.goto('/');
    
    const phoneOverlay = page.locator('#phone-overlay');
    const zIndex = await phoneOverlay.evaluate((el) => 
      window.getComputedStyle(el).zIndex
    );
    expect(parseInt(zIndex)).toBeGreaterThanOrEqual(1000);
  });

  test('Feed app tab is clickable and shows content', async ({ page }) => {
    await page.goto('/');
    
    const feedTab = page.locator('button:has-text("Feed")');
    await expect(feedTab).toBeVisible();
    await feedTab.click();
    
    const feedContent = page.locator('#phone-app-content');
    await expect(feedContent).toContainText('FEED');
  });

  test('Messages app tab is clickable and shows content', async ({ page }) => {
    await page.goto('/');
    
    const messagesTab = page.locator('button:has-text("Messages")');
    await expect(messagesTab).toBeVisible();
    await messagesTab.click();
    
    const messagesContent = page.locator('#phone-app-content');
    await expect(messagesContent).toContainText('MESSAGES');
  });

  test('Vault app tab is clickable and shows content', async ({ page }) => {
    await page.goto('/');
    
    const vaultTab = page.locator('button:has-text("Vault")');
    await expect(vaultTab).toBeVisible();
    await vaultTab.click();
    
    const vaultContent = page.locator('#phone-app-content');
    await expect(vaultContent).toContainText('THE VAULT');
    await expect(vaultContent).toContainText(/No files found in local storage|LOCAL ENCRYPTED STORAGE/);
  });

  test('Identity app tab is clickable and shows content', async ({ page }) => {
    await page.goto('/');
    
    const identityTab = page.locator('button:has-text("Identity")');
    await expect(identityTab).toBeVisible();
    await identityTab.click();
    
    const identityContent = page.locator('#phone-app-content');
    await expect(identityContent).toContainText('IDENTITY');
  });

  test('Time Blocks display shows TB balance', async ({ page }) => {
    await page.goto('/');
    
    const timeBlocksDisplay = page.locator('#phone-tb-display');
    await expect(timeBlocksDisplay).toBeVisible();
    await expect(timeBlocksDisplay).toContainText('TB:');
  });
});
