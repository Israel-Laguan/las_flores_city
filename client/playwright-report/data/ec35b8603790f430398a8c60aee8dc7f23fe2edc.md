# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mvw.e2e.test.ts >> 5.2b — Typewriter Skip & Choice Selection >> Clicking dialogue box skips typewriter and shows choices
- Location: tests/e2e/mvw.e2e.test.ts:81:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#dialogue-overlay, .dialogue-overlay')
    - locator resolved to <div id="dialogue-overlay"></div>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying click action
      - waiting 100ms
    53 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]: "TB:"
      - generic [ref=e5]: 48/48
    - generic [ref=e6]:
      - generic [ref=e7]: "Credits:"
      - generic [ref=e8]: "100"
    - generic [ref=e9]:
      - generic [ref=e10]: "Location:"
      - generic [ref=e11]: Apartment
  - generic [ref=e13]:
    - banner [ref=e14]:
      - generic [ref=e15]: 8:00 AM
      - generic [ref=e16]:
        - generic [ref=e17]: 100 C$
        - generic [ref=e18]: ⚡ 100%
    - main [ref=e19]
    - contentinfo [ref=e20]:
      - button "Feed" [ref=e21] [cursor=pointer]
      - button "Messages" [ref=e22] [cursor=pointer]
      - button "Vault" [ref=e23] [cursor=pointer]
      - button "Identity" [ref=e24] [cursor=pointer]
```

# Test source

```ts
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
  44  |     await expect(canvas).toBeVisible({ timeout: 10_000 });
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
> 114 |     await dialogueOverlay.click();
      |                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  145 |       }
  146 |       const overlay = page.locator('#dialogue-overlay, .dialogue-overlay');
  147 |       await expect(overlay).toBeVisible({ timeout: 5_000 });
  148 |       await page.waitForTimeout(100);
  149 |       await overlay.click();
  150 |       await expect(choicesContainer).toBeVisible({ timeout: 3_000 });
  151 |     }
  152 | 
  153 |     // Find the Romance/flirt choice button
  154 |     const romanceBtn = page.locator('.dialogue-choice').filter({ hasText: /romance|flirt|distracted|music/i }).first();
  155 |     const anyChoice  = page.locator('.dialogue-choice').first();
  156 |     const target = (await romanceBtn.count()) > 0 ? romanceBtn : anyChoice;
  157 | 
  158 |     await expect(target).toBeVisible({ timeout: 3_000 });
  159 | 
  160 |     // Capture console log for monologue feed verification
  161 |     const consoleLogs: string[] = [];
  162 |     page.on('console', (msg) => consoleLogs.push(msg.text()));
  163 | 
  164 |     await target.click();
  165 | 
  166 |     // Double-click defense: choices container must be disabled or hidden immediately
  167 |     const pointerEvents = await choicesContainer.evaluate(
  168 |       (el) => window.getComputedStyle(el).pointerEvents
  169 |     );
  170 |     // Either disabled via pointer-events:none or a disabled attribute
  171 |     const isDisabledAttr = await choicesContainer.getAttribute('disabled');
  172 |     expect(pointerEvents === 'none' || isDisabledAttr !== null).toBe(true);
  173 | 
  174 |     // Next dialogue node must be fetched and rendered
  175 |     const dialogueText = page.locator('.dialogue-text, #dialogue-text');
  176 |     await expect(dialogueText).toBeVisible({ timeout: 5_000 });
  177 |   });
  178 | 
  179 |   test('Monologue console feed appends system log entry after choice', async ({ page }) => {
  180 |     await injectAuth(page);
  181 |     await page.goto('/');
  182 |     await page.waitForTimeout(1_000);
  183 | 
  184 |     const monologueFeed = page.locator('.introspection-console, #monologue-feed, .monologue-feed');
  185 |     await expect(monologueFeed).toBeVisible({ timeout: 5_000 });
  186 | 
  187 |     // The feed must contain at least one entry (populated on load)
  188 |     const feedItems = monologueFeed.locator('p, .log-entry, .feed-item');
  189 |     await expect(feedItems.first()).toBeVisible({ timeout: 3_000 });
  190 |   });
  191 | });
  192 | 
  193 | // ─────────────────────────────────────────────────────────────────────────────
  194 | // Full "First Hour" Loop: Apartment → Move → Dialogue → Sleep
  195 | // ─────────────────────────────────────────────────────────────────────────────
  196 | test.describe('Full First Hour Loop', () => {
  197 |   test('Apartment → Move → Dialogue → Sleep completes without crash', async ({ page }) => {
  198 |     await injectAuth(page);
  199 | 
  200 |     // 1. Verify starting health
  201 |     const healthRes = await page.request.get(`${API_BASE}/health`);
  202 |     expect(healthRes.ok()).toBeTruthy();
  203 | 
  204 |     // 2. Move to Café
  205 |     const moveRes = await page.request.post(`${API_BASE}/player/move`, {
  206 |       data: { target_location_id: CAFE_SCENE_ID },
  207 |       headers: { Authorization: `Bearer ${authToken}` },
  208 |     });
  209 |     expect(moveRes.ok()).toBeTruthy();
  210 |     const moveData = await moveRes.json();
  211 |     expect(moveData.data.to_location_id).toBe(CAFE_SCENE_ID);
  212 |     expect(moveData.data.tb_cost).toBe(1);
  213 | 
  214 |     // 3. Start a dialogue at the Café
```