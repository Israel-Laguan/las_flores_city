# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phone-overlay.spec.ts >> Phone OS Overlay >> Vault app tab is clickable and shows content
- Location: tests/e2e/phone-overlay.spec.ts:43:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#phone-app-content')
Expected substring: "VAULT"
Received string:    ""
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#phone-app-content')
    14 × locator resolved to <main class="app-viewport" id="phone-app-content"></main>
       - unexpected value ""

```

```yaml
- main
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Phone OS Overlay', () => {
  4  |   test('Phone overlay is visible on page load', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     
  7  |     const phoneOverlay = page.locator('#phone-overlay');
  8  |     await expect(phoneOverlay).toBeVisible();
  9  |   });
  10 | 
  11 |   test('Phone overlay has correct z-index (above Phaser canvas)', async ({ page }) => {
  12 |     await page.goto('/');
  13 |     
  14 |     const phoneOverlay = page.locator('#phone-overlay');
  15 |     const zIndex = await phoneOverlay.evaluate((el) => 
  16 |       window.getComputedStyle(el).zIndex
  17 |     );
  18 |     expect(parseInt(zIndex)).toBeGreaterThanOrEqual(1000);
  19 |   });
  20 | 
  21 |   test('Feed app tab is clickable and shows content', async ({ page }) => {
  22 |     await page.goto('/');
  23 |     
  24 |     const feedTab = page.locator('button:has-text("Feed")');
  25 |     await expect(feedTab).toBeVisible();
  26 |     await feedTab.click();
  27 |     
  28 |     const feedContent = page.locator('#phone-app-content');
  29 |     await expect(feedContent).toContainText('FEED');
  30 |   });
  31 | 
  32 |   test('Messages app tab is clickable and shows content', async ({ page }) => {
  33 |     await page.goto('/');
  34 |     
  35 |     const messagesTab = page.locator('button:has-text("Messages")');
  36 |     await expect(messagesTab).toBeVisible();
  37 |     await messagesTab.click();
  38 |     
  39 |     const messagesContent = page.locator('#phone-app-content');
  40 |     await expect(messagesContent).toContainText('MESSAGES');
  41 |   });
  42 | 
  43 |   test('Vault app tab is clickable and shows content', async ({ page }) => {
  44 |     await page.goto('/');
  45 |     
  46 |     const vaultTab = page.locator('button:has-text("Vault")');
  47 |     await expect(vaultTab).toBeVisible();
  48 |     await vaultTab.click();
  49 |     
  50 |     const vaultContent = page.locator('#phone-app-content');
> 51 |     await expect(vaultContent).toContainText('VAULT');
     |                                ^ Error: expect(locator).toContainText(expected) failed
  52 |   });
  53 | 
  54 |   test('Identity app tab is clickable and shows content', async ({ page }) => {
  55 |     await page.goto('/');
  56 |     
  57 |     const identityTab = page.locator('button:has-text("Identity")');
  58 |     await expect(identityTab).toBeVisible();
  59 |     await identityTab.click();
  60 |     
  61 |     const identityContent = page.locator('#phone-app-content');
  62 |     await expect(identityContent).toContainText('IDENTITY');
  63 |   });
  64 | 
  65 |   test('Time Blocks display shows TB balance', async ({ page }) => {
  66 |     await page.goto('/');
  67 |     
  68 |     const timeBlocksDisplay = page.locator('#phone-tb-display');
  69 |     await expect(timeBlocksDisplay).toBeVisible();
  70 |     await expect(timeBlocksDisplay).toContainText('TB:');
  71 |   });
  72 | });
  73 | 
```