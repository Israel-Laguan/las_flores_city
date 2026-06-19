# Task 6.4 — Diegetic Terminal Error & Recovery Modals

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Global diegetic modal for fatal network/server errors with auto-retry; theme-reactive confirmation modal; removal of remaining browser dialogs; `fetchAPI` hardening

## Spec drift reconciliation

The original Task 6.4 spec contained several items that conflicted with the established codebase. Per AGENTS.md ("if a task spec conflicts with established codebase patterns, follow the established pattern and surface the drift before changing behavior"), the following were corrected during design review:

| Spec claim | Actual codebase | Resolution |
|---|---|---|
| Import `globalEventBus` from `'../../eventBus'` | Singleton is `eventBus` (not `globalEventBus`) from `'../utils/EventBus'` (`EventBus.ts:36`) | Use correct name + path |
| Import `phoneStore` from `'../../store/PhoneStore'` | Correct symbol, wrong path — real path is `'../store/PhoneStore'` | Use correct path |
| Mount via `document.getElementById('phone-app-viewport')` | No such element exists. Real tree is `#phone-overlay` (=`.phone-os-container`) → `.phone-bezel` → `.phone-screen` → `#phone-app-content` | Mount inside `.phone-screen` |
| `secureFetch(url, options): Promise<Response>` as a new module | Existing API layer is `fetchAPI<T>(): Promise<T>` in `utils/api.ts:20-43` (parses JSON, throws on `!ok`, injects auth). ~30 callers depend on this signature. A raw-`Response` wrapper breaks all callers | Harden `fetchAPI<T>` in place; zero call-site changes |
| Add `theme-fugitive`/`theme-loyalist` class **to the modal overlay** | Theme classes live only on `.phone-os-container` and cascade via CSS custom properties (`phone.css:129-144`, applied by `DialogueUI.ts:225-231`) | Mount modal inside `.phone-screen`; inherit the cascade. No theme classes on the modal |
| `alignment === 'fugitive' ? fugitive : loyalist` (2-way) | `Alignment = 'neutral' \| 'loyalist' \| 'fugitive'` (`PhoneStore.ts:1`). Neutral is a real third state (cyan defaults), distinct from Loyalist Gold | Honor all 3 via cascade; neutral = unset `:root` defaults |
| Hardcoded `rgba(0,136,255,0.1)` header tint | Renders blue on a fugitive (red) player | Use `color-mix(in srgb, var(--neon-blue) 12%, transparent)` so tint is faction-aware |
| DoD: "remove all `confirm()`/`prompt()`" | Zero `confirm()`/`prompt()` exist in client code; only 4 `alert()` calls (`MyMeApp.ts:267,280,293`, `TrabajandoApp.ts:110`) | Replace 4 alerts; confirm path built as infrastructure + 1 demonstrator |
| §5.1 "double modal conflict handled by `cleanupTimers()`" | `cleanupTimers()` only handles timers, not orphaned promises — concurrent failures leak the original caller's promise | Single-flight queue + closure-based `{retry, abort}` registry (see §2) |
| New deps implied (rate-limiter-style wrappers) | Task 4.3 lean-architecture lesson: no new deps | Zero dependencies — pure TS/CSS + existing `eventBus`/`fetch` |

## Architecture

Four units, each with one responsibility, meeting only at the `eventBus` seam:

| Unit | File | Responsibility |
|---|---|---|
| `TerminalModal` | `client/src/components/TerminalModal.ts` (new, ~180 LOC) | Owns the one DOM overlay; renders confirm/error; single-flight queue + promise lifecycle |
| Hardened `fetchAPI<T>` | `client/src/utils/api.ts` (existing, modified) | Wraps its existing `fetch` in try/catch; on network/5xx failure emits `ui:show_error` and awaits a caller-owned retry closure. Zero signature change |
| Modal CSS | `client/src/styles/terminal-modal.css` (new, ~90 LOC) | Styled via inherited cascade. Fatal-error override block. No theme classes, no `--neon-*` declarations |
| Boot wiring | `client/src/main.ts` (existing, +3 lines) | Import CSS; `new TerminalModal()` in `initOnce()` after `new BreakthroughAlert()` |

This matches the established pattern where `eventBus` is the integration seam (used by `DialogueUI`, `SleepOverlay`, `LocationScene`, etc.). The modal knows nothing about fetch; fetch knows nothing about DOM.

**Net change surface: 2 new files, 5 edited files, 0 deleted, 0 new dependencies.**

## 1. `TerminalModal` — single-flight queue + closure registry

The modal is a singleton with one DOM overlay (built once in the constructor, reused for every render) and three private state concerns.

### Lifecycle state

```typescript
type Mode = 'confirm' | 'error' | 'idle';

private mode: Mode = 'idle';
private overlay: HTMLElement;
private contentBox: HTMLElement;
private countdownTimer: number | null;
private errorQueue: ErrorRequest[] = [];   // FIFO of waiting errors
private activeError: ErrorRequest | null;  // currently shown
private lastFocused: HTMLElement | null;   // for focus restoration
```

### Event bus contract

Existing `eventBus` from `'../utils/EventBus'`. Three events:

- `ui:show_confirm` — `{ id, title, message, confirmLabel?, cancelLabel?, onConfirm(), onCancel?() }`
- `ui:show_error` — `{ id, signature, code, message, retry(): Promise<unknown>, abort(): void }`
- `ui:close_modal` — no payload

### Single-flight rules (makes the DoD's "no leak / no stack" honest)

```
on ui:show_error(req):
  if mode === 'confirm':       → keep confirm up; ENQUEUE req (errors wait on explicit user choice)
  else if mode === 'error':
    if activeError.signature === req.signature:  → COALESCE (drop duplicate)
    else:                                         → ENQUEUE req at queue tail
  else (idle):                  → activate(req): render, focus, start 5s countdown

on retry-success:  activeError.retry() resolves → close → drain (activate next queued)
on retry-fail:     re-render active error with fresh countdown (same req, stays active)
on countdown(0):   auto-invoke activeError.retry()
on ABORT button / Escape / ui:close_modal:  activeError.abort() → close → drain
```

**Signature** = normalized `${method} ${endpoint}`. A background SMS poll failing 10× shows once, not 10×; a foreground Banco click failing simultaneously queues behind it and shows next. No stacking, no timer leak (`cleanupTimers()` runs on every transition).

### Why this is better than the spec

The spec's §5.1 claimed `cleanupTimers()` handles concurrent failures — but it only covers timers, not the **orphaned promises** of callers whose `fetchAPI` is suspended awaiting retry. The single-flight queue + per-caller closure registry (§4) closes that hole: every suspended caller has exactly one `{retry, abort}` pair scoped to its own call frame, so it can never be resolved against the wrong caller or leaked.

### UX decision: errors queue behind an active confirm

A confirmation is an explicit, high-intent, potentially irreversible user decision (faction commit, gold-credit spend). An auto-retry error barging in mid-decision is jarring. Errors wait until the confirm resolves. (Approved during design review.)

### Theme

None in TS beyond a `data-alignment` attribute on the overlay. The overlay is mounted inside `.phone-screen`, so `var(--neon-blue)`, `var(--border-glow)`, etc. resolve to the active faction automatically via cascade. Fatal-error styling overrides via a `.fatal-error` class (red), regardless of faction.

## 2. UI markup & CSS — inherit, don't redeclare

### Markup

```html
<div id="terminal-modal-overlay" class="terminal-modal-overlay" data-alignment="neutral" hidden>
  <div class="terminal-modal-content" role="dialog" aria-modal="true" aria-labelledby="tm-title">
    <div class="terminal-modal-header">…</div>
    <div class="terminal-modal-body">…</div>
    <div class="terminal-modal-footer">
      <button class="modal-btn" data-action="…">…</button>
    </div>
  </div>
</div>
```

- `hidden` attribute (not `style.display='none'`) — accessible by default
- `role="dialog"` + `aria-modal="true"` — the spec's overlay had no ARIA
- `data-action` on buttons → single delegated click handler (no per-render `addEventListener`, no leaked listeners)

### CSS strategy

The overlay mounts inside `.phone-screen`, so `var(--neon-blue)`, `var(--neon-cyan)`, `var(--border-glow)`, `var(--terminal-bg)` resolve to the active faction **for free**. The CSS file declares **zero** `--neon-*` custom properties.

```css
.terminal-modal-overlay {
  position: absolute;            /* fills .phone-screen (position: relative) */
  inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; box-sizing: border-box;
  background: rgba(3, 7, 18, 0.98);
  z-index: 200;
  font-family: 'Courier New', monospace;
}
.terminal-modal-overlay[hidden] { display: none; }

.terminal-modal-content {
  width: 100%; max-width: 320px;
  background: #030712;
  border: 1px solid var(--neon-blue);     /* faction-aware via cascade */
  border-radius: 8px;
  box-shadow: var(--border-glow);
  overflow: hidden;
}
.terminal-modal-header {
  background: color-mix(in srgb, var(--neon-blue) 12%, transparent);  /* faction-aware tint */
  border-bottom: 1px solid var(--neon-blue);
  padding: 8px 12px; font-size: 0.65rem; font-weight: bold;
  color: var(--neon-blue);
}

/* Fatal-error override: red regardless of faction */
.terminal-modal-overlay.fatal-error .terminal-modal-content {
  border-color: #ff3333; box-shadow: 0 0 15px rgba(255, 51, 51, 0.4);
}
.terminal-modal-overlay.fatal-error .terminal-modal-header {
  background: rgba(255, 51, 51, 0.1);
  border-bottom-color: #ff3333; color: #ff3333;
}
.fatal-error .modal-btn.retry { border-color:#ff3333; color:#ff3333; width:100%; }
.fatal-error .modal-btn.retry:hover { background:#ff3333; color:#000; }
```

`color-mix(in srgb, var(--neon-blue) 12%, transparent)` makes the header tint faction-aware automatically (blue→red→gold). `inset: 0` + `position: absolute` fills the relative `.phone-screen` exactly and clips to the phone bezel's `overflow:hidden`.

### Animations (reused verbatim from spec — they're good)

- `warning-flicker 1.5s infinite alternate` on `.error-flash` (header opacity pulse)
- `caret-blink 0.8s infinite steps(2)` on `.pulse-caret`

### Accessibility

- **Focus management:** on `activate()`, capture `document.activeElement` into `lastFocused`, focus the primary button. On `close()`, restore `lastFocused`. (~4 lines.)
- **Escape key:** cancels confirm / abandons active error — same as clicking ABORT (calls `activeError.abort()`, rejects the caller, closes, drains queue). Standard dialog convention; matches the single-flight rules in §1. One `keydown` listener on `document`, added once in the constructor.
- **Touch:** modal lives inside `.phone-os-container`, so the existing `touch-action: manipulation; -webkit-tap-highlight-color: transparent` rule for buttons (`phone.css:190-199`) already covers modal buttons via the `.phone-os-container button` selector. No duplicate rule.

## 3. Hardened `fetchAPI<T>()` — the network interceptor

### Current (`utils/api.ts:20-43`)

```typescript
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(authToken && { Authorization: `Bearer ${authToken}` }) };
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options?.headers } });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
```

### Target

Network failures (`TypeError`) and HTTP 5xx route to `ui:show_error`; the caller's `Promise<T>` pauses and resumes transparently. **4xx stays a throw** — client errors are not "the server crashed"; current behavior preserved.

```typescript
function shouldIntercept(err: unknown): boolean {
  if (err instanceof TypeError) return true;                 // network/down/DNS
  const status = (err as any)?.status;
  return typeof status === 'number' && status >= 500;        // server crashes only
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET';
  const headers = { 'Content-Type': 'application/json', ...(authToken && { Authorization: `Bearer ${authToken}` }) };

  const attempt = async (): Promise<T> => {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...options?.headers } });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const e = new Error(errorData.error || `API error: ${response.status} ${response.statusText}`) as Error & { status?: number };
      e.status = response.status;                            // typed rethrow so interceptor can see it
      throw e;
    }
    return response.json();
  };

  try {
    return await attempt();
  } catch (err) {
    if (!shouldIntercept(err)) throw err;                    // 4xx etc. — unchanged

    // Caller's Promise<T> suspends here until modal-driven retry resolves.
    return await new Promise<T>((resolve, reject) => {
      eventBus.emit('ui:show_error', {
        id: crypto.randomUUID(),
        signature: `${method} ${endpoint}`,
        code: err instanceof TypeError ? 'UPLINK_BROKEN' : `SERVER_CRASH_${(err as any).status}`,
        message: 'The remote neural server failed to acknowledge the packet signature or has crashed.',
        retry: async () => {                                 // modal calls this; closure owns resolver
          const result = await attempt();                    // throws on failure → modal re-enqueues
          resolve(result);                                   // success: unblock original caller
        },
        abort: () => reject(new Error('UPLINK_ABANDONED_BY_USER')),  // modal calls on explicit dismiss
      });
    });
  }
}
```

### The closure-based `{retry, abort}` registry

There is **no `Map<id, {resolve,reject}>`** anywhere. Each `fetchAPI` invocation creates its own `new Promise`, and the `retry`/`abort` callbacks close over *that invocation's* `resolve`/`reject`. When the modal calls `retry()` and it succeeds, `resolve(result)` fires for exactly the one caller that's waiting — zero possibility of resolving the wrong caller, zero possibility of a leak (the closure dies with the call frame once resolved). Simpler and safer than the spec's cross-object token map.

### What does NOT change

- `setAuthToken`/`getAuthToken` — untouched
- All ~30 exported API functions — untouched signatures, untouched callers (`getPlayerState`, `movePlayer`, `buyShopItem`, etc.). They inherit retry behavior for free
- 4xx handling — still throws `Error` with `.status`, same as today
- `crypto.ts` and `aiWorker.ts` — left alone (local error handling is correct; workers can't reach the DOM `eventBus`)

### `BancoApp` raw-fetch migration

`BancoApp.ts:24-50` calls `fetch()` directly to `/banco/statement`. Add `api.getBankStatement()` to `api.ts` and migrate the call. BancoApp already imports `* as api`. This brings Banco under the same retry resilience as the rest of the app.

## 4. Call-site migration & alert replacements

### Change inventory

| File | Change |
|---|---|
| `client/src/utils/api.ts` | Harden `fetchAPI<T>` (§3); add `getBankStatement()` |
| `client/src/components/TerminalModal.ts` | **NEW** (~180 LOC) |
| `client/src/styles/terminal-modal.css` | **NEW** (~90 LOC) |
| `client/src/main.ts` | +2 imports, +1 `new TerminalModal()` in `initOnce()` |
| `client/src/ui/apps/BancoApp.ts` | Replace raw `fetch()` (L24-50) with `await api.getBankStatement()` |
| `client/src/ui/apps/MyMeApp.ts` | Replace 3 `alert()` (L267, L280, L293); add buy-flow `ui:show_confirm` demonstrator |
| `client/src/ui/apps/TrabajandoApp.ts` | Replace 1 `alert()` (L110) |

### Alert replacements — route by intent

The 4 alerts split by intent:

**Intercepted failures (network/5xx):** These will now *never reach the catch block* in practice, because `fetchAPI` suspends the caller in the fatal-error modal and only rejects on user-abort. The catch block's job shrinks to **4xx + user-abort** only → render an inline `.app-error` with a diegetic message (no `alert`):

```typescript
// MyMeApp.ts L265-267, before:
} catch (err) {
  alert((err as Error).message || 'Purchase failed.');
}
// After:
} catch (err) {
  this.showErrorInline('TRANSACTION REJECTED', (err as Error).message);
}
```

`showErrorInline` reuses the existing `.app-error` pattern (styled in `comms.css:269`, already used by `VaultApp.ts:53`, `MyMeApp.ts:65`, `FeedApp.ts:22`). **Zero new CSS.** Applies to all 4 alert sites.

Rationale (approved during review): a 4xx (e.g. "not enough gold credits") is a standard narrative boundary, not a system crash. Reserving the fatal modal for 5xx/network while routing 4xx to inline `.app-error` maintains narrative and mechanical consistency.

### `MyMeApp` buy-flow confirm demonstrator

Wire one `ui:show_confirm` call before a gold-credit purchase as a production-ready demonstrator. Exercises the confirm path in E2E, provides a copy-paste template for future confirm sites, and prevents accidental premium-currency spend. (Approved during review.)

## 5. Testing strategy

The client test mode is **Playwright E2E** (`client/tests/e2e/*.test.ts`); there is no client unit-test runner wired. E2E is the right tool — it exercises real DOM, real `fetch`, real event bus.

**New file `client/tests/e2e/terminal-modal.e2e.test.ts`**, ~6 tests mapped directly to DoD bullets:

| Test | DoD bullet it proves |
|---|---|
| `network failure intercepted → modal shows, countdown runs` | "catches network timeouts and 5xx" + "5-second countdown loop" |
| `HTTP 500 intercepted → fatal-error theme, FATAL EXCEPTION header` | "catches ... HTTP 5xx codes, routing to ui:show_error" |
| `retry resolves original caller — BancoApp renders after recovery` | "Successful reconnects resolve the original paused promise" (load-bearing) |
| `user ABORT rejects caller; app shows inline .app-error` | closure `{retry, abort}` correctness |
| `two failures with different signatures serialize, no stacked DOM` | "rapid error trigger loops cleanly overwrite without leaking timers or stacking" |
| `confirm modal inherits faction palette via cascade` | "theme-reactive confirmation modal matches faction variables" |

**Mechanism:** Playwright `page.route('**/banco/statement', r => r.abort('failed'))` to force `TypeError`; `page.unroute(...)` to let retry succeed. Assert `#terminal-modal-overlay` visible + countdown text, then `await expect(bancoLedger).toBeVisible()` after unroute — proving the *original* `getBankStatement()` promise resolved.

## Verification commands (per AGENTS.md checklist)

```bash
npm run lint --workspace=client
npm run build --workspace=client
npx playwright test client/tests/e2e/terminal-modal.e2e.test.ts
```

No server changes → no container rebuild. No content changes → no `validate:content`.

## Non-goals (YAGNI fence)

- ❌ No `aiWorker.ts` changes (workers can't reach DOM `eventBus`)
- ❌ No `crypto.ts` changes (local error handling is correct)
- ❌ No `confirm()`/`prompt()` migration (none exist in client code)
- ❌ No global `window.fetch` monkeypatch (chose `fetchAPI` hardening)
- ❌ No theme classes on the modal (cascade inheritance only)
- ❌ No new dependencies (Task 4.3 lean-architecture lesson)

## DoD mapping

| DoD bullet | Satisfied by |
|---|---|
| Global `TerminalModal` initialized and appended to Phone screen viewport | §1 + §4 (`main.ts` boot wiring; mounts inside `.phone-screen`) |
| Browser `alert()`/`confirm()` entirely removed | §4 (4 alerts → inline `.app-error`; zero `confirm` existed) |
| `ui:show_confirm` renders theme-reactive confirm matching faction | §2 (cascade inheritance) + §4 (`MyMeApp` demonstrator) |
| `fetchAPI` interceptor catches network timeouts and 5xx → `ui:show_error` | §3 (`shouldIntercept`) |
| Error modal runs 5-second countdown then auto-retries | §1 (`on countdown(0): auto-invoke retry`) |
| Successful reconnect resolves original paused promise | §3 (closure `resolve(result)`) — proven by E2E test 3 |
| Rapid error triggers overwrite cleanly, no timer/DOM leaks | §1 (single-flight + signature coalescing) — proven by E2E test 5 |
