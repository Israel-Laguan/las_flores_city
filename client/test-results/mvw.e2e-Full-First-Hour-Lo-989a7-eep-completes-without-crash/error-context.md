# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mvw.e2e.test.ts >> Full First Hour Loop >> Apartment → Move → Dialogue → Sleep completes without crash
- Location: tests/e2e/mvw.e2e.test.ts:197:3

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
  215 |     const baristaId = '123e4567-e89b-12d3-a456-426614174000';
  216 |     const startRes = await page.request.post(`${API_BASE}/dialogue/start`, {
  217 |       data: { characterId: baristaId, sceneId: CAFE_SCENE_ID },
  218 |       headers: { Authorization: `Bearer ${authToken}` },
  219 |     });
  220 |     // 201 = started fresh, or 404 = no dialogue seeded yet; both are acceptable non-crash states
  221 |     expect([200, 201, 404]).toContain(startRes.status());
  222 | 
  223 |     // 4. Move back to Apartment for sleep
  224 |     const returnRes = await page.request.post(`${API_BASE}/player/move`, {
  225 |       data: { target_location_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012' },
  226 |       headers: { Authorization: `Bearer ${authToken}` },
  227 |     });
  228 |     expect(returnRes.ok()).toBeTruthy();
  229 | 
  230 |     // 5. Sleep — advances day, resets TB
  231 |     const sleepRes = await page.request.post(`${API_BASE}/player/sleep`, {
  232 |       headers: { Authorization: `Bearer ${authToken}` },
  233 |     });
  234 |     expect(sleepRes.ok()).toBeTruthy();
  235 |     const sleepData = await sleepRes.json();
  236 |     expect(sleepData.data.time_blocks).toBe(48);
  237 |     expect(sleepData.data.current_day).toBeGreaterThanOrEqual(2);
  238 | 
  239 |     // 6. Final UI check — page must still be alive
  240 |     await page.goto('/');
  241 |     const canvas = page.locator('#game-container canvas');
> 242 |     await expect(canvas).toBeVisible({ timeout: 10_000 });
      |                          ^ Error: expect(locator).toBeVisible() failed
  243 |   });
  244 | });
  245 | 
```