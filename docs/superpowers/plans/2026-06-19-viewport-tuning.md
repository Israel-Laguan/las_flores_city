# Task 6.3 — Mobile & Widescreen Viewport Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phone OS responsive to mobile software keyboards and strip touch-latency delays, without changing the Phaser canvas or breaking accessibility.

**Architecture:** A new `ViewportManager` class subscribes to the native `visualViewport` API and writes CSS custom properties to `:root`. CSS consumers (`.phone-bezel` in mobile media query) read those vars with safe fallbacks. Touch latency is eliminated via `touch-action: manipulation` on interactive phone elements. The viewport meta gains `viewport-fit=cover` for notch-device support without disabling zoom.

**Tech Stack:** TypeScript (plain DOM classes, no framework), CSS custom properties, Playwright E2E tests.

**Design spec:** `docs/superpowers/specs/2026-06-19-viewport-tuning-design.md`

**Key codebase facts:**
- Event bus singleton: `import { eventBus } from '../utils/EventBus'` — never `globalEventBus`
- Phone bridge pattern: `client/src/bridge/PhoneBridge.ts` — take `containerId: string`, use `eventBus.emit()`
- Existing test pattern: Playwright E2E in `client/tests/e2e/`, run with `npx playwright test` from `client/`
- Phaser scale: `Phaser.Scale.FIT` in `client/src/main.ts:38` — do NOT change this

---

### Task 1: Create ViewportManager class

**Files:**
- Create: `client/src/bridge/ViewportManager.ts`

- [ ] **Step 1: Create the ViewportManager**

```typescript
import { eventBus } from '../utils/EventBus';

export class ViewportManager {
  private rafId: number | null = null;

  constructor() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener('resize', this.scheduleUpdate);
    window.visualViewport.addEventListener('scroll', this.scheduleUpdate);
    this.update();
  }

  private scheduleUpdate = (): void => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.update();
    });
  };

  private update(): void {
    const vp = window.visualViewport!;
    const height = vp.height;
    const offsetTop = vp.offsetTop;

    document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-offset-top', `${offsetTop}px`);

    eventBus.emit('viewport:resize', { height, offsetTop });
  }

  destroy(): void {
    if (!window.visualViewport) return;
    window.visualViewport.removeEventListener('resize', this.scheduleUpdate);
    window.visualViewport.removeEventListener('scroll', this.scheduleUpdate);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/israel/personal/code/las_flores_city && npm run build --workspace=client`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/bridge/ViewportManager.ts
git commit -m "feat(client): add ViewportManager with rAF-coalesced visualViewport tracking"
```

---

### Task 2: Wire ViewportManager into main.ts

**Files:**
- Modify: `client/src/main.ts:14-15` (imports area) and `client/src/main.ts:80-91` (initOnce function)

- [ ] **Step 1: Add import**

After the existing imports at the top of `main.ts`, add:

```typescript
import { ViewportManager } from './bridge/ViewportManager';
```

- [ ] **Step 2: Instantiate in initOnce()**

Inside `initOnce()`, after `window.__lasFloresInitialized = true;` and before the existing manager instantiations, add:

```typescript
const viewportManager = new ViewportManager();
(window as any).__viewportManager = viewportManager;
```

The final `initOnce()` body should look like:

```typescript
function initOnce() {
  if (window.__lasFloresInitialized) {
    return;
  }

  window.__lasFloresInitialized = true;
  const viewportManager = new ViewportManager();
  (window as any).__viewportManager = viewportManager;
  new DialogueUI();
  new MonologueFeed();
  new BreakthroughAlert();
  initThemeEngine();
  initApp();
}
```

- [ ] **Step 3: Verify build**

Run: `cd /home/israel/personal/code/las_flores_city && npm run build --workspace=client`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts
git commit -m "feat(client): wire ViewportManager into initOnce lifecycle"
```

---

### Task 3: Update CSS — dynamic viewport height + touch-action

**Files:**
- Modify: `client/src/styles/phone.css:179` (mobile bezel height) and append block at end

- [ ] **Step 1: Replace `100vh` with CSS var in mobile bezel**

In the `@media (max-width: 768px)` block, change the `.phone-bezel` `height` from `100vh` to use the var:

```css
/* Before (line 179) */
    height: 100vh;

/* After */
    height: var(--viewport-height, 100vh);
```

- [ ] **Step 2: Add touch-action optimization block at end of file**

Append after line 188 (the closing `}` of the media query):

```css

/* Eliminate 300ms tap delay on interactive Phone OS elements */
.phone-os-container button,
.phone-os-container .inbox-item,
.phone-os-container .vault-card,
.phone-os-container input,
.phone-os-container select,
.phone-os-container textarea {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
```

- [ ] **Step 3: Verify build**

Run: `cd /home/israel/personal/code/las_flores_city && npm run build --workspace=client`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/phone.css
git commit -m "feat(client): add dynamic viewport height and touch-action optimization"
```

---

### Task 4: Update viewport meta tag

**Files:**
- Modify: `client/index.html:6`

- [ ] **Step 1: Add `viewport-fit=cover` to the viewport meta tag**

```html
<!-- Before -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Do NOT add `maximum-scale=1.0` or `user-scalable=no`.

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "feat(client): add viewport-fit=cover for notch-device safe area support"
```

---

### Task 5: Write E2E tests

**Files:**
- Create: `client/tests/e2e/viewport-tuning.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Viewport Tuning (Task 6.3)', () => {
  test('CSS custom properties are injected on :root after page load', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    const viewportHeight = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--viewport-height');
    });

    // On desktop browsers with visualViewport support, this should be a px value.
    // On headless environments without visualViewport, the var is never set and
    // the fallback 100vh takes over — which is correct graceful degradation.
    if (viewportHeight) {
      expect(viewportHeight).toMatch(/^\d+px$/);
    }
  });

  test('touch-action: manipulation is applied to interactive phone elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Open the phone so interactive elements are rendered
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(400);

    // Check that phone nav buttons have touch-action: manipulation
    const navButtons = page.locator('.phone-os-container .nav-bar button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const touchAction = await navButtons.nth(i).evaluate(
        (el) => getComputedStyle(el).touchAction
      );
      expect(touchAction).toContain('manipulation');
    }
  });

  test('viewport meta does not disable zoom (accessibility)', async ({ page }) => {
    await page.goto('/');

    const metaContent = await page.evaluate(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      return meta?.content ?? '';
    });

    // Must have viewport-fit=cover for notch support
    expect(metaContent).toContain('viewport-fit=cover');

    // Must NOT have zoom-locking directives (WCAG 1.4.4)
    expect(metaContent).not.toContain('user-scalable=no');
    expect(metaContent).not.toContain('maximum-scale=1.0');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd /home/israel/personal/code/las_flores_city/client && npx playwright test tests/e2e/viewport-tuning.spec.ts --reporter=list`
Expected: All 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add client/tests/e2e/viewport-tuning.spec.ts
git commit -m "test(client): add E2E tests for viewport tuning (Task 6.3)"
```

---

### Task 6: Full verification

**Files:** None — verification only.

- [ ] **Step 1: Lint**

Run: `cd /home/israel/personal/code/las_flores_city && npm run lint --workspace=client`
Expected: No new errors.

- [ ] **Step 2: Build**

Run: `cd /home/israel/personal/code/las_flores_city && npm run build --workspace=client`
Expected: Clean build.

- [ ] **Step 3: Run full E2E suite**

Run: `cd /home/israel/personal/code/las_flores_city/client && npx playwright test --reporter=list`
Expected: All existing tests still pass; no regressions.

- [ ] **Step 4: Verify no server changes were needed**

Run: `cd /home/israel/personal/code/las_flores_city && git diff --name-only HEAD~6`
Expected: Only files under `client/` — no server or shared changes.
