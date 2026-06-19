# Task 6.3 — Mobile & Widescreen Viewport Tuning

**Date:** 2026-06-19
**Status:** Approved
**Scope:** CSS viewport handling, touch-latency removal, mobile keyboard awareness

## Spec drift reconciliation

The original spec contained several items that conflicted with the established codebase. Per AGENTS.md ("if a task spec conflicts with established codebase patterns, follow the established pattern and surface the drift"), the following were corrected during design review:

| Spec claim | Actual codebase | Resolution |
|---|---|---|
| `@supports` glassmorphism fallback is missing | Already implemented at `phone.css:75-79`, tested at `ux-polish.spec.ts:137-155` | No code change; pre-existing satisfies DoD |
| Import `globalEventBus` | Singleton is `eventBus` from `../utils/EventBus` | Use correct import |
| Phaser Scale mode is `RESIZE` (§4.1) | `main.ts:38` uses `Phaser.Scale.FIT` | Keep FIT; no canvas change |
| Add `user-scalable=no, maximum-scale=1.0` (§3.1) | WCAG 1.4.4 violation; Lighthouse flag; unnecessary on modern browsers | Add `viewport-fit=cover` only |
| Stray `[4]` citation artifacts throughout | LLM source-citation leftovers | Ignored |
| Inject CSS vars on `.phone-os-container` | Vars needed by bezel, dialogue overlay, monologue feed | Inject on `:root` |
| Spec's `.phone-bezel { position: absolute; bottom: 0 }` | Not present in current mobile media query | Omit; flexbox handles positioning |

## Changes

### 1. New file: `client/src/bridge/ViewportManager.ts`

A ~35-line class that subscribes to `window.visualViewport` `resize`/`scroll` events, coalesces via `requestAnimationFrame`, and writes CSS custom properties to `document.documentElement`:

- `--viewport-height` — precise visible viewport height (excludes software keyboards)
- `--viewport-offset-top` — visual viewport's offset from the layout viewport top

Also emits `viewport:resize` on `eventBus` for any JS consumer.

Key design choices:
- rAF coalescing prevents layout thrashing during keyboard animations (iOS fires `resize` + `scroll` simultaneously at high frequency)
- Arrow function for `scheduleUpdate` so `removeEventListener` works without `.bind()`
- `destroy()` is idempotent, matching `PhoneBridge.destroy()` pattern
- Graceful no-op on browsers without `visualViewport` support

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

### 2. Edit: `client/src/styles/phone.css`

**2a. Dynamic viewport height in mobile media query (line 179)**

```css
/* Before */
height: 100vh;

/* After */
height: var(--viewport-height, 100vh);
```

The `100vh` fallback ensures correct rendering before `ViewportManager` fires (or on desktop). The var only affects the mobile path where keyboard height changes matter.

Note: We do NOT apply `translateY(var(--viewport-offset-top))` to the bezel. iOS WebKit natively pans the visual viewport when the keyboard opens; fighting this with CSS transforms causes double-offsetting. The `--viewport-offset-top` var is written for future consumers (e.g., a dialogue overlay that needs explicit offset correction) but has no CSS consumer in this task.

**2b. Touch-action optimization (new block at end of file)**

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

Scoped to `.phone-os-container` to avoid touching the Phaser canvas or other overlays.

### 3. Edit: `client/index.html` (line 6)

```html
<!-- Before -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

`viewport-fit=cover` enables CSS `env(safe-area-inset-*)` for notched devices. No zoom lock — modern browsers disable the 300ms delay with just `width=device-width`, and `touch-action: manipulation` handles the rest.

### 4. Wire-up: `client/src/main.ts`

Add to `initOnce()`, alongside existing manager instantiations:

```typescript
import { ViewportManager } from './bridge/ViewportManager';

// Inside initOnce():
const viewportManager = new ViewportManager();
(window as any).__viewportManager = viewportManager;
```

The `window.__` exposure follows the `__phoneStore` pattern for E2E test inspection.

### 5. New test file: `client/tests/e2e/viewport-tuning.spec.ts`

Three assertions covering the DoD:

1. **CSS var injection** — simulate mobile viewport (`page.setViewportSize({ width: 390, height: 844 })`), assert `--viewport-height` on `:root` is a numeric px value.
2. **Touch-action applied** — assert interactive phone elements have `touch-action: manipulation` in computed styles.
3. **No zoom lock** — assert viewport meta does NOT contain `user-scalable=no` or `maximum-scale=1.0`.

## DoD mapping

| DoD bullet | How satisfied |
|---|---|
| `@supports` progressive glassmorphism | Pre-existing at `phone.css:75-79` |
| `ViewportManager` subscribes to `visualViewport` | New `bridge/ViewportManager.ts` |
| Bezel scales via `--viewport-height` | CSS var with `100vh` fallback in mobile media query |
| Phaser input coords stay aligned | Satisfied by keeping `Phaser.Scale.FIT` unchanged |
| Viewport meta + `touch-action: manipulation` | `viewport-fit=cover` in meta + CSS rules in `phone.css` |
| Tested on simulated mobile viewports | New `viewport-tuning.spec.ts` |

## Files touched

| File | Action |
|---|---|
| `client/src/bridge/ViewportManager.ts` | Create |
| `client/src/styles/phone.css` | Edit (lines 179, append block) |
| `client/index.html` | Edit (line 6) |
| `client/src/main.ts` | Edit (import + 2 lines in `initOnce()`) |
| `client/tests/e2e/viewport-tuning.spec.ts` | Create |

No new dependencies. No Phaser config changes. No zoom lock.
