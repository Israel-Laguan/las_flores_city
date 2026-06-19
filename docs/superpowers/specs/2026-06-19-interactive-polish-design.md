# Task 6.2 — App-Specific Interactive Polish

**Date:** 2026-06-19
**Status:** Approved
**Epic:** Deep Dive Expansion — tactile micro-interactions and high-fidelity transitions within individual Phone OS applications.

## Scope

Three polish features plus the foundation wiring they depend on:

1. **Messages:** Typing bubble (bouncing dots) + typewriter reveal for NPC messages
2. **Banco de Las Flores:** Balance flash animation (green/red scale + glow) on credit changes
3. **Vault:** FLIP card-to-modal shared-element transition (expand + reverse collapse)

Plus three wiring prerequisites: mount BancoApp in PhoneOverlay, load orphaned `banco.css`, and add a minimal `destroy()` lifecycle hook across all app classes.

## Spec-Drift Corrections

The original Task 6.2 spec contained multiple inaccuracies against the actual codebase. These are the corrections applied in this design:

| Original spec claim | Actual codebase state | Correction applied |
|---|---|---|
| `#phone-os-container` | `#phone-overlay` (class `.phone-os-container`) | FLIP uses `.vault-app` as reference frame |
| `.chat-bubble.npc` | `.comms-app .bubble.npc` | Typing bubble targets `.bubble.npc.typing` |
| `.balance-value` | `.balance-card .value` | Flash animation targets `.balance-card .value` |
| `globalEventBus` | `eventBus` (singleton from `utils/EventBus`) | All code uses `eventBus.emit(...)` |
| Task 4.4 = signed media URLs | Task 4.4 = `DATABASE_URL`/docker-compose; signed URLs already exist in `api.ts:230-244` | No signed-URL work needed |
| BancoApp is a live mounted app | BancoApp is dead code — `PhoneOverlay` renders a placeholder div | Mount BancoApp in `PhoneOverlay.createApps()` |
| `banco.css` is loaded | `banco.css` is orphaned — never imported in `main.ts` or linked in `index.html` | Add side-effect import in `main.ts` |
| No existing lifecycle hooks | True — no app has `destroy()` | Add `destroy()` + `subs[]` tracker pattern |
| Store subscribe as sole flash trigger | BancoApp already emits `'bank:transaction'` event (zero subscribers) | `bank:transaction` primary + store fallback + 100ms dedup |

---

## 1. Foundation Wiring

### 1.1 — Mount BancoApp in PhoneOverlay

**File:** `client/src/components/PhoneOverlay.ts:68-73`

Replace the placeholder div with the real class instance, mirroring Messages/Vault/Identity:

```typescript
const banco = document.createElement('div');
new BancoApp(banco);
this.apps.set('banco', banco);
```

Apps are mounted once at boot and re-shown on tab switch (not re-instantiated). BancoApp's `init()` fetch fires once. To refresh on re-open (matching Messages/Vault pattern), BancoApp subscribes to `phone:app-opened` and re-fetches when `key === 'banco'`. This also re-emits `bank:transaction` on each visit.

### 1.2 — Load orphaned banco.css

**File:** `client/src/main.ts`

Add a side-effect import alongside existing `comms.css`/`vault.css` imports:

```typescript
import './styles/banco.css';
```

Without this, `.balance-card .value` and the flash keyframes will not apply.

### 1.3 — Minimal app lifecycle / destroy() hook

**Rationale:** Apps are never unmounted on tab switch — `switchApp` swaps which element is in the viewport while elements + subscriptions persist. But MessagesApp and VaultApp hold leaked `eventBus.on` subscriptions (never unsubscribed). Adding `destroy()` is defensive scaffolding that satisfies the DoD and future-proofs against a later rebuild-phone flow.

**Pattern — per-app teardown trackers:**

Two parallel arrays, one per listener registry (eventemitter3 and the DOM `document` have different removal APIs and cannot share one):

```typescript
private subs: Array<[string, (...a: any[]) => void]> = [];        // eventBus.on/off pairs
private docListeners: Array<(...a: any[]) => void> = [];           // document.addEventListener pairs
private unsubStore: (() => void) | null = null;                   // phoneStore.subscribe returns its own unsub

private on(event: string, h: (...a: any[]) => void): void {
  this.subs.push([event, h]);
  eventBus.on(event, h);
}

private onDoc(event: string, h: (...a: any[]) => void): void {
  this.docListeners.push(h);
  document.addEventListener(event, h);
}

destroy(): void {
  for (const [e, h] of this.subs) eventBus.off(e, h);
  this.subs = [];
  for (const h of this.docListeners) document.removeEventListener(event, h);
  this.docListeners = [];
  if (this.unsubStore) this.unsubStore();
}
```

`PhoneOverlay` gains `appInstances: Map<string, { destroy?(): void }>` tracking and iterates it in its own `destroy()`. `BancoFlashController` (§3) uses the same pattern internally.

---

## 2. Messages — Typing Bubble + Typewriter Reveal

### 2.1 — CSS (in `comms.css`)

```css
.comms-app .bubble.npc.typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  width: fit-content;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background: var(--neon-cyan);
  border-radius: 50%;
  opacity: 0.4;
  animation: dot-bounce 1.4s infinite both;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-6px); opacity: 1; }
}
```

### 2.2 — Pacing pipeline

**New private fields on MessagesApp:**

```typescript
private typewriterInterval: number | null = null;
private skipRequested = false;
private isPacing = false;
private aborted = false;
private activePacingTimeout: number | null = null;
private resolveActivePacing: (() => void) | null = null;
```

**`renderThread` becomes async**, calls `pacedDelivery` after building DOM structure:

```typescript
private async renderThread(detail: SMSThreadDetail): Promise<void> {
  // existing HTML build (unchanged — NPC .bubble-text spans left empty)
  // existing event listener wiring (unchanged)
  await this.pacedDelivery(detail);
  this.scrollThreadToBottom();
}
```

**`pacedDelivery(detail)`** — sequential async loop over NPC messages:

1. For each NPC message, show typing bubble → delay → typewriter-reveal text
2. Player messages render immediately (no pacing)
3. Checks `this.aborted` before each NPC message (abort-safe)

**`showTypingBubble(parent, textLength)`:**

- Creates `.bubble.npc.typing` element with three bouncing dots
- Inserts after the empty NPC bubble
- Plays `sfx_sms_typing_loop` SFX
- Delay: `Math.max(600, Math.min(2000, textLength * 25))` ms
- Uses stored resolver pattern (`this.resolveActivePacing`) for instant skip-on-tap

**`typewriterReveal(bubbleText, text)` — segment-aware reveal:**

Mirrors `DialogueUI.ts:296-334` (30ms interval, skip support) but handles `<important>` tags correctly:

- Parses text into segments: plain strings and `<important>` tags
- Plain segments: reveal character-by-character with `createTextNode`
- `<important>` segments: inject as a whole `document.createElement('important')` node when reached
- SFX every 2nd character (same throttle as DialogueUI)
- On skip/abort: set full text immediately via `renderBubbleContents`

### 2.3 — Skip on tap

Clicking `.thread-scroll` during pacing:

- Sets `this.skipRequested = true`
- Immediately resolves any active typing bubble delay via `this.resolveActivePacing()`
- Clears `this.activePacingTimeout`
- Typewriter interval checks `skipRequested` and resolves instantly

### 2.4 — Abort safety

`destroy()` sets `this.aborted = true`, clears timeout and interval, tears down subscriptions.

---

## 3. Banco — Balance Flash

### 3.1 — Architecture: decoupled BancoFlashController

**New file:** `client/src/ui/apps/BancoFlashController.ts`

Standalone class (~50 lines). Not a method on BancoApp — keeps rendering and animation responsibilities separate. Listens to both event sources:

- **Primary:** `'bank:transaction'` event from BancoApp (rich payload: `{ credits, goldCredits, latestTransaction }`)
- **Fallback:** `phoneStore.subscribe` catches credits changed outside bank ledger (e.g. Trabajando gig income via `PhoneOverlay.ts:81-89`)

Uses the same `subs[]` tracker pattern from §1.3 to guarantee both subscriptions are torn down on `destroy()`:

```typescript
export class BancoFlashController {
  private lastCredits = phoneStore.getState().credits;
  private lastGoldCredits = phoneStore.getState().goldCredits;
  private lastFlashTime = 0;
  private lastFlashField = '';
  private subs: Array<[string, (...a: any[]) => void]> = [];
  private unsubStore: (() => void) | null = null;

  constructor() {
    const onTransaction = (data: { credits: number; goldCredits: number }) => {
      this.flash('credits', data.credits - this.lastCredits);
      this.flash('goldCredits', data.goldCredits - this.lastGoldCredits);
      this.lastCredits = data.credits;
      this.lastGoldCredits = data.goldCredits;
    };
    this.subs.push(['bank:transaction', onTransaction]);
    eventBus.on('bank:transaction', onTransaction);

    this.unsubStore = phoneStore.subscribe((state) => {
      if (state.credits !== this.lastCredits) {
        this.flash('credits', state.credits - this.lastCredits);
        this.lastCredits = state.credits;
      }
      if (state.goldCredits !== this.lastGoldCredits) {
        this.flash('goldCredits', state.goldCredits - this.lastGoldCredits);
        this.lastGoldCredits = state.goldCredits;
      }
    });
  }

  destroy(): void {
    for (const [e, h] of this.subs) eventBus.off(e, h);
    this.subs = [];
    if (this.unsubStore) this.unsubStore();
  }
}
```

### 3.2 — Flash logic

`flash(field, diff)`:

- Queries `.balance-card.creds .value` or `.balance-card.gold-creds .value` via `document.querySelector`
- Skips if element not found (Banco tab not visible — fire-and-forget)
- 100ms dedup guard: skips if same field flashed within 100ms (prevents double-fire from store sub + event)
- Applies `flash-income` or `flash-expense` class with reflow trick (`void el.offsetWidth`)
- Removes class after 650ms (post-animation cleanup)
- Emits `sfx_credits_up` / `sfx_credits_down` via `eventBus.emit('audio:play_sfx', ...)`

### 3.3 — Instantiation

Instantiated once in `PhoneOverlay.createApps()` after BancoApp, stored for destroy-time cleanup:

```typescript
this.flashController = new BancoFlashController();
```

### 3.4 — CSS (in `banco.css`)

```css
.balance-card .value {
  will-change: transform, color, filter;
}

.balance-card .value.flash-income {
  animation: flash-green-glow 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

.balance-card .value.flash-expense {
  animation: flash-red-glow 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes flash-green-glow {
  0%   { transform: scale(1);    color: var(--neon-cyan); }
  15%  { transform: scale(1.12); color: #33ff33; filter: drop-shadow(0 0 8px #33ff33); }
  100% { transform: scale(1);    color: var(--neon-cyan); filter: none; }
}

@keyframes flash-red-glow {
  0%   { transform: scale(1);    color: var(--neon-cyan); }
  15%  { transform: scale(1.12); color: #ff3333; filter: drop-shadow(0 0 8px #ff3333); }
  100% { transform: scale(1);    color: var(--neon-cyan); filter: none; }
}
```

---

## 4. Vault — FLIP Card-to-Modal Transition

### 4.1 — FLIP technique

Standard First-Last-Invert-Play pattern, adapted for the Vault layout:

| Step | Action |
|---|---|
| **First** | `getBoundingClientRect()` on clicked `.vault-card` |
| **Last** | Modal's final state: `translate(0,0) scale(1,1)`, full `.vault-app` container |
| **Invert** | Position modal at card's coordinates (no transition) |
| **Play** | CSS transition to identity transform → browser animates expansion |

**Reference frame:** `.vault-app` (direct parent of grid and modal) — not the phone bezel or browser viewport. Card offsets calculated as `cardRect.left - containerRect.left`, etc.

### 4.2 — `openModal(item, cardElement)` — rewritten

Signature changes to accept the card element (passed from click handler).

1. Capture card rect relative to `.vault-app`
2. Reset modal contents (`image.src = ''`, title = `'DECRYPTING...'`)
3. **INVERT:** Set `modal.style.transition = 'none'`, position at card coordinates via `translate + scale`
4. Force reflow (`void modal.offsetWidth`)
5. **PLAY:** Set transition to `transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease`, animate to identity
6. **Fetch concurrently:** `api.fetchVaultMediaUrl(item.id)` runs in parallel with animation
7. Zero-width guard: if `containerRect.width === 0`, skip FLIP and fall back to instant `display: flex`

### 4.3 — Reverse FLIP on close

**New field:** `private lastOpenedCard: HTMLElement | null = null`

**Close handler:**
- Save card reference in click handler
- On close: capture card rect, animate modal back to card position (300ms, `cubic-bezier(0.5, 0, 0.75, 0)` — reverse of open easing)
- After 320ms timeout, reset and set `display: none`
- If card is detached (grid re-rendered while modal open), collapse gracefully to scale-0

**Escape key:** Added via `onDoc('keydown', ...)` (the helper from §1.3), which stores it in `docListeners[]` for automatic teardown in `destroy()`.

### 4.4 — CSS updates (in `vault.css`)

```css
.vault-modal {
  /* existing rules unchanged */
  will-change: transform, opacity;
  transform-origin: top left;
}
```

No `backdrop-filter: blur()` — the 95% opaque background renders blur invisible and adds unnecessary GPU cost during FLIP animation.

---

## 5. Testing

### 5.1 — E2E tests: `client/tests/e2e/interactive-polish.spec.ts`

Playwright E2E following existing patterns (register test user, inject auth, navigate, assert DOM).

| Test | Assertions |
|---|---|
| Typing bubble appears during NPC thread load | `.bubble.npc.typing` visible within pacing window |
| Typing bubble resolves to full text | `.bubble.npc.typing` gone; `.bubble.npc .bubble-text` non-empty |
| Skip tap resolves all messages instantly | After click: no `.typing`, all NPC bubbles have text |
| Banco tab shows live balance (not placeholder) | Contains `BANCO DE LAS FLORES` and `.balance-card` elements |
| Balance flash CSS on credits change | `.flash-income` or `.flash-expense` on `.balance-card .value` |
| Vault modal FLIP transform on open | Modal `transform` is non-identity during 400ms window |
| Vault modal full-screen after animation | `transform` identity, `opacity` 1 after 500ms |
| Vault modal closes on Escape | `display: none` after 400ms |

Uses `page.waitForFunction` for DOM polling, not arbitrary `waitForTimeout`.

### 5.2 — Not tested (by design)

- Exact animation timing (flaky in CI)
- SFX playback (no Playwright API)
- Internal dedup timing (not externally observable)

---

## 6. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `renderThread` becoming async breaks callers | Medium | Callers already use `void` prefix — no `.then()`/`await` consumers. Backwards-compatible. |
| Pacing makes thread loading feel slow | Low | 600–2000ms per NPC message, competitive with real SMS. Skip-on-tap escape hatch. |
| Typewriter + `<important>` edge cases | Low | Same regex as proven `renderBubbleContents`. Malformed tags degrade to plain text. |
| FLIP scale with zero-width container | Very Low | Guard: skip FLIP, fallback to instant `display: flex` if width is 0. |
| `banco.css` styles bleed to other apps | Very Low | All selectors scoped under `.banco-app` / `.balance-card` / `.ledger-*`. |
| Flash `querySelector` finds wrong element | Very Low | `.balance-card` only used in BancoApp and banco.css (grep-verified). |

---

## 7. Out of Scope

- Loading `feed.css` and `trabajando.css` (orphaned, unrelated to 6.2)
- Focus trap on Vault modal
- Backdrop-click-to-close on Vault modal
- Typewriter on player messages (only NPC messages are paced)
- Persistent balance display in nav bar
- Refactoring apps to use a template engine

---

## 8. Definition of Done

- [ ] Bouncing typing indicator (`.bubble.npc.typing` with `@keyframes dot-bounce`), zero thread-blocking
- [ ] Text delay: 25ms/char clamped 600–2000ms typing bubble + 30ms/char typewriter with `<important>` segment awareness
- [ ] Balance flash: green/red `scale(1.12)` + `drop-shadow` on `.balance-card .value`, `bank:transaction` primary + store fallback, 100ms dedup
- [ ] Audio cues: `sfx_credits_up` / `sfx_credits_down` via `eventBus.emit('audio:play_sfx', ...)` on every flash
- [ ] Vault FLIP: card rect → full-screen (400ms), concurrent fetch, reverse FLIP on close (300ms), Escape key
- [ ] Memory-leak protections: `destroy()` on all apps via `subs[]` + `eventBus.off()`, `BancoFlashController.destroy()`, abort-safe pacing
- [ ] BancoApp mounted in PhoneOverlay, `banco.css` loaded via `main.ts`
- [ ] 8 E2E tests in `interactive-polish.spec.ts`

---

## Files Modified

| File | Change |
|---|---|
| `client/src/components/PhoneOverlay.ts` | Mount BancoApp, add `appInstances` map, destroy() |
| `client/src/main.ts` | Import `banco.css` |
| `client/src/ui/apps/MessagesApp.ts` | Async `renderThread`, `pacedDelivery`, `showTypingBubble`, `typewriterReveal`, skip/abort, `destroy()` |
| `client/src/ui/apps/BancoApp.ts` | Subscribe to `phone:app-opened` for re-fetch, `destroy()` |
| `client/src/ui/apps/VaultApp.ts` | FLIP `openModal(item, cardElement)`, reverse-FLIP `closeModal`, Escape key, `destroy()` |
| `client/src/ui/apps/BancoFlashController.ts` | **New file** — decoupled flash controller |
| `client/src/styles/comms.css` | Typing bubble + `@keyframes dot-bounce` |
| `client/src/styles/banco.css` | Flash keyframes + `will-change` |
| `client/src/styles/vault.css` | `will-change` + `transform-origin` on `.vault-modal` |
| `client/tests/e2e/interactive-polish.spec.ts` | **New file** — 8 E2E tests |
