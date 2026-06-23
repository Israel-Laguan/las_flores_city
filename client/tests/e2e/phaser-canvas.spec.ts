import { test, expect } from '@playwright/test';

test.describe('Phaser Canvas', () => {
  test('Game canvas is rendered', async ({ page }) => {
    await page.goto('/');
    
    const gameContainer = page.locator('#game-container');
    await expect(gameContainer).toBeVisible();
    
    // Phaser creates a canvas element inside the container
    const canvas = gameContainer.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Canvas has correct dimensions', async ({ page }) => {
    await page.goto('/');
    
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();
    
    const width = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
    const height = await canvas.evaluate((el) => (el as HTMLCanvasElement).height);
    
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  test('Phone overlay does not block canvas when closed', async ({ page }) => {
    await page.goto('/');
    
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();
    
    // Wait for overlay to settle to none (closed state) before asserting
    const phoneOverlay = page.locator('#phone-overlay');
    await expect(phoneOverlay).toHaveCSS('pointer-events', 'none', { timeout: 5_000 });
  });
});
