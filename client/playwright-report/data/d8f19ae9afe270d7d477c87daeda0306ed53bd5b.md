# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mvw.e2e.test.ts >> 5.2a — Phaser Canvas NPC Click >> Clicking NPC position on canvas mounts dialogue overlay
- Location: tests/e2e/mvw.e2e.test.ts:38:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#game-container canvas')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
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
  1   | /**
  2   |  * MVW E2E Test Suite — Task 5.2
  3   |  * Drives a headless Chromium session through the "First Hour" gameplay loop.
  4   |  *
  5   |  * 5.2a: Phaser Canvas NPC click → dialogue overlay mounts (SLIDING_IN → TYPING)
  6   |  * 5.2b: Typewriter skip → "Romance" choice → double-click defense + monologue feed
  7   |  * Full loop: Apartment → Move → Dialogue → Sleep
  8   |  */
  9   | import { test, expect, Page } from '@playwright/test';
  10  | 
  11  | const API_BASE = process.env.API_URL || 'http://localhost:3000';
  12  | const CAFE_SCENE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
  13  | 
  14  | // ── Shared auth state ─────────────────────────────────────────────────────────
  15  | let authToken = '';
  16  | const testEmail = `mvw-e2e-${Date.now()}@example.com`;
  17  | const testUsername = `mvw_e2e_${Date.now()}`;
  18  | 
  19  | test.beforeAll(async ({ request }) => {
  20  |   const res = await request.post(`${API_BASE}/auth/register`, {
  21  |     data: { email: testEmail, username: testUsername, display_name: 'MVW E2E', password: 'test1234' },
  22  |   });
  23  |   expect(res.ok()).toBeTruthy();
  24  |   authToken = (await res.json()).data.token;
  25  | });
  26  | 
  27  | /** Inject the auth token into localStorage so the client picks it up automatically */
  28  | async function injectAuth(page: Page) {
  29  |   await page.addInitScript((token) => {
  30  |     localStorage.setItem('auth_token', token);
  31  |   }, authToken);
  32  | }
  33  | 
  34  | // ─────────────────────────────────────────────────────────────────────────────
  35  | // 5.2a — Phaser Canvas Coordinate Clicking
  36  | // ─────────────────────────────────────────────────────────────────────────────
  37  | test.describe('5.2a — Phaser Canvas NPC Click', () => {
  38  |   test('Clicking NPC position on canvas mounts dialogue overlay', async ({ page }) => {
  39  |     await injectAuth(page);
  40  |     await page.goto('/');
  41  | 
  42  |     // Wait for Phaser to fully render the canvas
  43  |     const canvas = page.locator('#game-container canvas');
> 44  |     await expect(canvas).toBeVisible({ timeout: 10_000 });
      |                          ^ Error: expect(locator).toBeVisible() failed
  45  | 
  46  |     // Navigate to the Café scene via API so there is an NPC to interact with
  47  |     await page.evaluate(
  48  |       async ([base, token, cafeId]) => {
  49  |         await fetch(`${base}/player/move`, {
  50  |           method: 'POST',
  51  |           headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  52  |           body: JSON.stringify({ target_location_id: cafeId }),
  53  |         });
  54  |       },
  55  |       [API_BASE, authToken, CAFE_SCENE_ID]
  56  |     );
  57  | 
  58  |     // Allow the scene transition to settle
  59  |     await page.waitForTimeout(1_500);
  60  | 
  61  |     const box = await canvas.boundingBox();
  62  |     expect(box).not.toBeNull();
  63  | 
  64  |     // Click the center-bottom of the canvas where the Barista NPC is anchored
  65  |     await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.9);
  66  | 
  67  |     // Dialogue overlay must appear — it starts in SLIDING_IN state
  68  |     const dialogueOverlay = page.locator('#dialogue-overlay, .dialogue-overlay');
  69  |     await expect(dialogueOverlay).toBeVisible({ timeout: 5_000 });
  70  | 
  71  |     // The overlay must transition into TYPING state (typewriter active)
  72  |     const typingText = page.locator('.dialogue-text, #dialogue-text');
  73  |     await expect(typingText).toBeVisible({ timeout: 5_000 });
  74  |   });
  75  | });
  76  | 
  77  | // ─────────────────────────────────────────────────────────────────────────────
  78  | // 5.2b — Typewriter Skip & Choice Selection
  79  | // ─────────────────────────────────────────────────────────────────────────────
  80  | test.describe('5.2b — Typewriter Skip & Choice Selection', () => {
  81  |   test('Clicking dialogue box skips typewriter and shows choices', async ({ page }) => {
  82  |     await injectAuth(page);
  83  |     await page.goto('/');
  84  |     await page.waitForTimeout(2_000);
  85  | 
  86  |     // Check if dialogue overlay is already visible (from previous scene/state)
  87  |     const dialogueOverlay = page.locator('#dialogue-overlay, .dialogue-overlay');
  88  |     const isVisible = await dialogueOverlay.isVisible();
  89  | 
  90  |     if (!isVisible) {
  91  |       // Navigate to Café and trigger NPC click
  92  |       await page.evaluate(
  93  |         async ([base, token, cafeId]) => {
  94  |           await fetch(`${base}/player/move`, {
  95  |             method: 'POST',
  96  |             headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  97  |             body: JSON.stringify({ target_location_id: cafeId }),
  98  |           });
  99  |         },
  100 |         [API_BASE, authToken, CAFE_SCENE_ID]
  101 |       );
  102 |       await page.waitForTimeout(1_500);
  103 | 
  104 |       const canvas = page.locator('#game-container canvas');
  105 |       const box = await canvas.boundingBox();
  106 |       if (box) {
  107 |         await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9);
  108 |       }
  109 |       await expect(dialogueOverlay).toBeVisible({ timeout: 5_000 });
  110 |     }
  111 | 
  112 |     // Wait 100ms then click to skip typewriter (as specified in task)
  113 |     await page.waitForTimeout(100);
  114 |     await dialogueOverlay.click();
  115 | 
  116 |     // Choices container must now be visible
  117 |     const choicesContainer = page.locator('.dialogue-choices, #dialogue-choices');
  118 |     await expect(choicesContainer).toBeVisible({ timeout: 3_000 });
  119 |   });
  120 | 
  121 |   test('Clicking "Romance" choice disables choices container immediately (double-click defense)', async ({ page }) => {
  122 |     await injectAuth(page);
  123 |     await page.goto('/');
  124 |     await page.waitForTimeout(2_000);
  125 | 
  126 |     // If we're not in a dialogue, set one up
  127 |     const choicesContainer = page.locator('.dialogue-choices, #dialogue-choices');
  128 |     if (!(await choicesContainer.isVisible())) {
  129 |       await page.evaluate(
  130 |         async ([base, token, cafeId]) => {
  131 |           await fetch(`${base}/player/move`, {
  132 |             method: 'POST',
  133 |             headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  134 |             body: JSON.stringify({ target_location_id: cafeId }),
  135 |           });
  136 |         },
  137 |         [API_BASE, authToken, CAFE_SCENE_ID]
  138 |       );
  139 |       await page.waitForTimeout(1_500);
  140 | 
  141 |       const canvas = page.locator('#game-container canvas');
  142 |       const box = await canvas.boundingBox();
  143 |       if (box) {
  144 |         await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9);
```