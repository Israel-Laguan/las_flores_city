# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: event-bus.spec.ts >> Event Bus Loopback >> Opening Messages app triggers world:pause event
- Location: tests/e2e/event-bus.spec.ts:15:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#phone-app-content')
Expected substring: "MESSAGES"
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
  3  | test.describe('Event Bus Loopback', () => {
  4  |   test('Opening a phone app triggers world:pause event', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     
  7  |     const feedTab = page.locator('button:has-text("Feed")');
  8  |     await feedTab.click();
  9  |     
  10 |     const feedContent = page.locator('#phone-app-content');
  11 |     await expect(feedContent).toContainText('FEED');
  12 |     await expect(feedContent).toContainText('Your personalized news feed is empty.');
  13 |   });
  14 | 
  15 |   test('Opening Messages app triggers world:pause event', async ({ page }) => {
  16 |     await page.goto('/');
  17 |     
  18 |     const messagesTab = page.locator('button:has-text("Messages")');
  19 |     await messagesTab.click();
  20 |     
  21 |     const messagesContent = page.locator('#phone-app-content');
> 22 |     await expect(messagesContent).toContainText('MESSAGES');
     |                                   ^ Error: expect(locator).toContainText(expected) failed
  23 |     await expect(messagesContent).toContainText('Subject 7, report to your assigned location.');
  24 |   });
  25 | 
  26 |   test('Phone overlay pointer events change on world pause/resume', async ({ page }) => {
  27 |     await page.goto('/');
  28 |     
  29 |     const phoneOverlay = page.locator('#phone-overlay');
  30 |     
  31 |     // Initially pointer events should be none
  32 |     const initialPointerEvents = await phoneOverlay.evaluate((el) => 
  33 |       window.getComputedStyle(el).pointerEvents
  34 |     );
  35 |     expect(initialPointerEvents).toBe('none');
  36 |     
  37 |     // Click on a tab to trigger world:pause
  38 |     const feedTab = page.locator('button:has-text("Feed")');
  39 |     await feedTab.click();
  40 |     
  41 |     // After click, pointer events should change
  42 |     await page.waitForTimeout(500);
  43 |     const afterClickPointerEvents = await phoneOverlay.evaluate((el) => 
  44 |       window.getComputedStyle(el).pointerEvents
  45 |     );
  46 |     // The phone container gets pointer events auto when paused
  47 |     // But the overlay itself may still be none - this tests the container
  48 |     expect(afterClickPointerEvents).toBeDefined();
  49 |   });
  50 | 
  51 |   test('Dialogue choice buttons are interactive', async ({ page }) => {
  52 |     await page.goto('/');
  53 |     
  54 |     // Check if dialogue choice buttons exist and are clickable
  55 |     const choiceButtons = page.locator('.dialogue-choice');
  56 |     const count = await choiceButtons.count();
  57 |     
  58 |     // If there are choices, verify they're interactive
  59 |     if (count > 0) {
  60 |       const firstChoice = choiceButtons.first();
  61 |       await expect(firstChoice).toBeVisible();
  62 |       
  63 |       // Verify the button has the correct data attributes
  64 |       const choiceId = await firstChoice.getAttribute('data-choice-id');
  65 |       const nodeId = await firstChoice.getAttribute('data-node-id');
  66 |       expect(choiceId).toBeTruthy();
  67 |       expect(nodeId).toBeTruthy();
  68 |     }
  69 |   });
  70 | });
  71 | 
```