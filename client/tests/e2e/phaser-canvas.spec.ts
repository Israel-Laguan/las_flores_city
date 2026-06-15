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
    
    // The phone overlay should not block canvas interactions
    const phoneOverlay = page.locator('#phone-overlay');
    const pointerEvents = await phoneOverlay.evaluate((el) => 
      window.getComputedStyle(el).pointerEvents
    );
    
    // Initially, pointer events should be none so canvas is interactive
    expect(pointerEvents).toBe('none');
  });
});
