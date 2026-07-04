import { test, expect, Page } from '@playwright/test';
import { startNewGame } from './helpers';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';

// Generate unique ID inside beforeAll to avoid collisions in parallel tests
let testEmail: string;
let testUsername: string;

test.beforeAll(async ({ request }) => {
  const rand = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  testEmail = `phaser-${rand()}@example.com`;
  testUsername = `phaser_${rand()}`;

  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: {
      email: testEmail,
      username: testUsername,
      display_name: 'Phaser Canvas E2E',
      password: 'test1234',
    },
  });
  if (!res.ok()) {
    console.log('Registration failed:', res.status(), await res.text());
  }
  expect(res.ok()).toBeTruthy();
});

async function injectAuth(page: Page) {
  await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { email: testEmail, password: 'test1234' },
  });
}

test.describe('Phaser Canvas', () => {
  test('Game canvas is rendered', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const gameContainer = page.locator('#game-container');
    await expect(gameContainer).toBeVisible();
    
    // Phaser creates a canvas element inside the container
    const canvas = gameContainer.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Canvas has correct dimensions', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();
    
    const width = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
    const height = await canvas.evaluate((el) => (el as HTMLCanvasElement).height);
    
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  test('Phone overlay does not block canvas when closed', async ({ page }) => {
    await injectAuth(page);
    await startNewGame(page);
    
    const canvas = page.locator('#game-container canvas');
    await expect(canvas).toBeVisible();
    
    // Wait for overlay to settle to none (closed state) before asserting
    const phoneOverlay = page.locator('#phone-overlay');
    await expect(phoneOverlay).toBeAttached();
    await expect(phoneOverlay).toHaveCSS('pointer-events', 'none', { timeout: 5_000 });
  });
});
