# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phaser-canvas.spec.ts >> Phaser Canvas >> Phone overlay does not block canvas when closed
- Location: tests/e2e/phaser-canvas.spec.ts:28:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#game-container canvas')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#game-container canvas')

```

```yaml
- text: "TB: 48/48 Credits: 100 Location: Apartment"
- banner: 8:00 AM 100 C$ ⚡ 100%
- main
- contentinfo:
  - button "Feed"
  - button "Messages"
  - button "Vault"
  - button "Identity"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Phaser Canvas', () => {
  4  |   test('Game canvas is rendered', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     
  7  |     const gameContainer = page.locator('#game-container');
  8  |     await expect(gameContainer).toBeVisible();
  9  |     
  10 |     // Phaser creates a canvas element inside the container
  11 |     const canvas = gameContainer.locator('canvas');
  12 |     await expect(canvas).toBeVisible();
  13 |   });
  14 | 
  15 |   test('Canvas has correct dimensions', async ({ page }) => {
  16 |     await page.goto('/');
  17 |     
  18 |     const canvas = page.locator('#game-container canvas');
  19 |     await expect(canvas).toBeVisible();
  20 |     
  21 |     const width = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
  22 |     const height = await canvas.evaluate((el) => (el as HTMLCanvasElement).height);
  23 |     
  24 |     expect(width).toBe(800);
  25 |     expect(height).toBe(600);
  26 |   });
  27 | 
  28 |   test('Phone overlay does not block canvas when closed', async ({ page }) => {
  29 |     await page.goto('/');
  30 |     
  31 |     const canvas = page.locator('#game-container canvas');
> 32 |     await expect(canvas).toBeVisible();
     |                          ^ Error: expect(locator).toBeVisible() failed
  33 |     
  34 |     // The phone overlay should not block canvas interactions
  35 |     const phoneOverlay = page.locator('#phone-overlay');
  36 |     const pointerEvents = await phoneOverlay.evaluate((el) => 
  37 |       window.getComputedStyle(el).pointerEvents
  38 |     );
  39 |     
  40 |     // Initially, pointer events should be none so canvas is interactive
  41 |     expect(pointerEvents).toBe('none');
  42 |   });
  43 | });
  44 | 
```