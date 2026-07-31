# Admin Light Theme — Milestones

> Phased, independently-mergeable milestones for adding a light theme to the Las Flores 2077 admin panel.
> Milestones M1–M2–M3 ship a beta toggle in ~half a day; M4–M7 complete the rollout and contract lock.
>
> **Created**: 2026-07-30
> **Status**: Draft (M1 ready to begin)
> **Related**: `docs/plans/admin-light-theme.md`, `docs/UI_STYLE_SYSTEM.md`, `docs/ADMIN_ARCHITECTURE.md`

---

## Decisions (locked before M1)

| # | Question | Decision |
|---|---|---|
| 1 | Light `--accent` color | `#007a33` (WCAG AA on white) |
| 2 | Toggle placement | `/settings` row only during beta; TopBar icon promoted after M5 |
| 3 | First-run default | Always dark (no `prefers-color-scheme` auto-detect in v1) |
| 4 | Rollout | Beta toggle on `/settings`; full TopBar promotion after sweep completes |
| 5 | Namespace strategy | **Path A** — per-namespace theme blocks in `@las-flores/ui`; do not unify `--color-*` with unprefixed namespace |

---

## M1 — Token foundation (`tokens`)

**Scope (Phase 0):** Add every missing token to `ui/src/styles/tokens.css` with dark values matching today's inline fallbacks. Tokenize `#000`/`#fff` on `.btn--primary`/`.badge--*` in `components.css`. Strip inline fallbacks for the new tokens from admin CSS. **Zero visual change.**

### Files changed

| File | Changes |
|---|---|
| `ui/src/styles/tokens.css` | Add ~14 missing tokens + `--on-accent`, `--on-danger`, `--on-info` |
| `ui/src/styles/components.css` | Replace `#000`/`#fff` with `var(--on-accent)` / `var(--on-danger)` / `var(--on-info)` |
| `admin/src/app/(admin)/story-builder/plans/plans.module.css` | Drop `, #ddd` / `, #f5f5f5` / `, #666` fallbacks (tokens now defined) |
| `admin/src/app/(admin)/story-builder/components/VerificationReport.module.css` | Drop all missing-token fallbacks |
| `admin/src/app/(admin)/story-builder/components/DescribeStep.module.css` | Drop `rgba(245,158,11,0.3)` fallback |
| `admin/src/app/(admin)/story-builder/components/ReviewStep.module.css` | Drop `rgba(245,158,11,0.3)` fallback |
| `admin/src/app/(admin)/story-builder/components/ContentCard.module.css` | Drop `rgba(0,200,150,0.15)` fallback |

### New token definitions (to be appended to `:root`)

```css
  /* Semantic surfaces */
  --surface: #15151f;
  --surface-raised: #1c1c2a;
  --surface-2: #1f2937;

  /* Semantic status colors */
  --status-success: #10b981;
  --status-error: #ef4444;
  --status-warn: #f59e0b;
  --status-success-bg: rgba(16, 185, 129, 0.25);
  --status-error-bg: rgba(239, 68, 68, 0.25);

  /* Semantic text */
  --text-muted: #8a8a9a;
  --text-primary: #ededed;
  --text-secondary: #aaa;
  --text: 0.9rem;

  /* Semantic backgrounds */
  --page-bg-alt: #15151f;
  --border-color: #333;
  --warning-border: rgba(245, 158, 11, 0.3);
  --accent-bg: rgba(0, 200, 150, 0.15);
  --hover-overlay: rgba(255, 255, 255, 0.05);

  /* Text drawn on colored backgrounds (for multi-theme) */
  --on-accent: #000;
  --on-danger: #fff;
  --on-info: #fff;
```

### Exit criteria

- `grep -rInE 'var\\(--(surface|surface-raised|surface-2|status-success|status-error|status-warn|status-success-bg|status-error-bg|text-muted|text-primary|text-secondary|text|page-bg-alt|border-color|warning-border|accent-bg|warning-bg|hover-overlay|on-accent|on-danger|on-info), ' admin/src --include='*.css'` returns 0 lines
- Every `var(--…)` reference to a newly-added token in `admin/src/**/*.css` now resolves without a fallback
- Admin visual smoke: sidebar, top bar, story-builder, assets — no visual change

### Tests

- Run existing admin suite: `npm run test --workspace=admin`
- No new tests required (pure token addition)

```bash
npm run lint --workspace=ui && npm run lint --workspace=admin
npm run test --workspace=admin
```

---

## M2 — Light palette (`light-palette`)

**Scope (Phase 1):** Add `body.theme-light { … }` override block to `tokens.css`. Redefine **all** tokens for light theme. No UI yet — testable only via DevTools.

### Files changed

| File | Changes |
|---|---|
| `ui/src/styles/tokens.css` | Add `body.theme-light { … }` block with all light values |

### Light values

```css
body.theme-light {
  /* Color primitives */
  --background: #ffffff;
  --foreground: #111111;
  --muted: #555555;
  --accent: #007a33;           /* WCAG AA on white */
  --panel-bg: #f7f7f8;
  --page-bg: #ececee;
  --border: #cfcfd6;

  /* Status */
  --danger: #b91c1c;
  --warning: #b45309;
  --info: #1d4ed8;
  --success: #15803d;
  --disabled-bg: #d0d0d6;
  --disabled-text: #6b7280;

  /* Semantic surfaces */
  --surface: #ffffff;
  --surface-raised: #ffffff;
  --surface-2: #f0f0f2;

  /* Semantic status backgrounds */
  --status-success-bg: rgba(21, 128, 61, 0.12);
  --status-error-bg: rgba(185, 28, 28, 0.12);

  /* Semantic text */
  --text-muted: #555555;
  --text-primary: #111111;
  --text-secondary: #666666;

  /* Semantic backgrounds */
  --page-bg-alt: #f5f5f5;
  --border-color: #cfcfd6;
  --warning-border: rgba(180, 83, 9, 0.4);
  --accent-bg: rgba(0, 122, 51, 0.12);
  --hover-overlay: rgba(0, 0, 0, 0.06);

  /* Text on colored backgrounds */
  --on-accent: #ffffff;        /* dark green bg -> white text */
  --on-danger: #ffffff;
  --on-info: #ffffff;

  /* Typography */
  --text: 0.9rem;

  /* Elevation */
  --shadow-glow: 0 0 8px rgba(0, 0, 0, 0.12);

  /* Keep existing spacing/radius tokens unchanged */
}
```

### Exit criteria

- `<body class="theme-light">` in DevTools fully re-skins the shell chrome (sidebar, top bar, breadcrumbs)
- No flash of dark theme during SSR (will be resolved in M3 with `suppressHydrationWarning`)
- No visual regressions in dark mode (default)

### Tests

```bash
npm run lint --workspace=ui && npm run typecheck --workspace=ui
npm run lint --workspace=admin && npm run test --workspace=admin
```

---

## M3 — Theme toggle (`toggle`)

**Scope (Phase 2):** Build the admin-side theme engine and a `/settings`-only beta toggle. This is the first **user-visible** milestone.

### Files created/changed

| File | Role |
|---|---|
| `admin/src/lib/themeEngine.ts` | Read `lf-admin-theme` from `localStorage`; apply/remove `theme-light` class on `<body>` after mount |
| `admin/src/components/ThemeToggle.tsx` | Small control rendered as Appearance row in `/settings` |
| `admin/src/components/ThemeToggle.module.css` | Styles for the toggle row |
| `admin/src/app/layout.tsx` | Add `suppressHydrationWarning` to `<body>` |
| `admin/src/app/(admin)/settings/page.tsx` | Import + render `<ThemeToggle />` |

### `themeEngine.ts` contract

```ts
// Keys
const STORAGE_KEY = 'lf-admin-theme'; // 'dark' | 'light'

// Read (safe, no throw)
function readStoredTheme(): 'dark' | 'light'

// Apply
function applyTheme(mode: 'dark' | 'light'): void

// Toggle
function toggleTheme(): 'dark' | 'light'

// Subscribe to changes (ThemeToggle re-renders)
type Listener = (mode: 'dark' | 'light') => void;
function subscribeTheme(listener: Listener): () => void
```

Follows the same post-mount `useEffect` pattern as `AdminShell.tsx`'s `COLLAPSE_STORAGE_KEY` restore (lines 35–59).

### `settings/page.tsx` addition

Add an Appearance section below the existing settings rows:

```tsx
<section className="appearanceSection">
  <h3>Appearance</h3>
  <ThemeToggle />
</section>
```

### Exit criteria

- Opening `/settings` shows "Theme: Dark" / "Theme: Light" toggle
- Clicking toggle re-skins the entire page instantly
- Preference persists across reloads (`localStorage`)
- SSR hydration mismatch absent (suppressed)

### Tests

| File | What it covers |
|---|---|
| `admin/src/lib/__tests__/themeEngine.test.ts` | apply / toggle / subscribe / localStorage edge cases |
| `admin/src/components/__tests__/ThemeToggle.test.tsx` | renders current mode, click toggles, calls engine |

```bash
npm run lint --workspace=admin && npm run test --workspace=admin
```

---

## M4 — Admin CSS sweep I — core modules (`sweep-core`)

**Scope (Phase 3):** Strip user-visible color literals from the worst offenders. Each file is independently mergeable.

### Sort order (highest impact first)

| File | Hex | rgba | Primary issues |
|---|---|---|---|
| `assets/assets.module.css` | 44 | 0 | full page hardcoded (`#1a1a2e`, `#00ff00`, `#ff0000`, `#0d0d1a`) |
| `story-builder/components/VerificationReport.module.css` | 22 | 7 | surfaces, status colors, text |
| `story-builder/components/ReviewStep.module.css` | 9 | 3 | surfaces, warning-border |
| `diff/diff.module.css` | 13 | 2 | grays, status colors |
| `quality/quality.module.css` | 12 | 4 | grays, status tints |
| `story-arc/story-arc.module.css` | 10 | 0 | grays, `#0066ff` |

### Conversion rules (per file)

- Dark surfaces -> `var(--surface)` / `var(--surface-raised)` / `var(--surface-2)` / `var(--page-bg)` / `var(--panel-bg)`
- `#00ff00` -> `var(--accent)`
- `#aaa`/`#888`/`#666`/`#999`/`#555` -> `var(--muted)` / `var(--text-secondary)` / `var(--disabled-text)`
- Dark surface hex (`#1a1a2e`, `#0d0d1a`, `#1c1c2a`, `#1f2937`, `#15151f`) -> `var(--panel-bg)` / `var(--page-bg)`
- `rgba(255,255,255,...)` hover overlays -> `var(--hover-overlay)`
- Status tints -> `var(--status-success-bg)` / `var(--status-error-bg)` / `var(--warning-bg)`
- `#000`/`#fff` on buttons: keep if background is a colored token (not a light surface), otherwise swap to token

### Exit criteria

- `grep -cIo '#[0-9a-fA-F]\{3,8\}' <file>` returns 0 for each file in the list
- `grep -cIo 'rgba(' <file>` drops only white-overlay and untransformed status-tint lines
- Dark theme visual smoke: each page looks identical to pre-M4

### Tests

```bash
npm run lint --workspace=admin && npm run test --workspace=admin
```

---

## M5 — Admin CSS sweep II — tail modules (`sweep-tail`)

**Scope:** Complete the remaining admin CSS files (roughly long tail + shell hover overlays).

### Files

Long tail: `migration.module.css`, `validation.module.css`, `content-linker.module.css`, `pipeline.module.css`, `stories/**`, `missions/**`, `characters/**`, `scenes/**`, `locations/**`, `mysteries/**`, `overlays/**`, `gigs/**`, `maps/**`, `shop/**`, `vault/**`, `editor.module.css`, `promotion.module.css`, `analytics.module.css`, `settings.module.css`, lore `**`, etc.

Tokenize last white-overlay rgba in `Sidebar.module.css` and `TopBar.module.css`:
- `rgba(255,255,255,0.04)` -> `var(--hover-overlay)` (down from 0.05 in light via tokens block)

### Exit criteria

- `grep -rIo '#[0-9a-fA-F]\{3,8\}\b' admin/src --include='*.css' | wc -l` = **0**
- White-overlay rgba count in Sidebar+TopBar = 0
- Remaining `rgba(` are limited to: error/success/warning feedback boxes (reuse tokens), and unavoidable decorative shadows where no token yet exists

### Tests

```bash
npm run lint --workspace=admin && npm run test --workspace=admin
```

---

## M6 — Client CSS sweep (`sweep-client`)

**Scope (Phase 3, parallel):** Apply the same contract sweep to the game client. The client's `themeEngine.ts` and `--neon-*` runtime variables are untouched.

### Untouched

- `client/src/utils/themeEngine.ts` (runtime mechanism)
- JS-set `--neon-*` variables
- `client/src/styles/themes.css` (`--color-*` namespace — Path A stays separate)

### Target

- `main-menu.css`, `feed.css`, `phone.css`, `map.css`, `comms.css`, and all other `client/src/**/*.css` files
- Replace hex/rgba color literals with `var(--muted)` / `var(--foreground)` / `var(--panel-bg)` / etc.
- Add any missing client tokens to `ui/src/styles/tokens.css` if needed (same file, both namespaces share it)

### Exit criteria

- `grep -rIo '#[0-9a-fA-F]\{3,8\}\b' client/src --include='*.css'` = 0
- `npm run lint --workspace=client && npm run test --workspace=client && npm run build --workspace=client`
- Client games and menus look identical to pre-M6

---

## Open questions (remaining)

1. **WCAG spot-check automation:** Should we add an automated `wcag-contrast` step to CI, or keep it manual?
2. **Path B revisit cadence:** After Phase 3 settles, schedule Path B (namespace unification) review? Not needed to resolve _this_ milestone doc.
3. **`--on-accent` contrast in light mode:** `#007a33` on white with `--on-accent: #fff` is WCAG AA. If we later darken the accent to `#005a26`, `--on-accent: #fff` still passes. If we ever use a lighter accent, flip the token — no app changes.

---

## Commit order

```text
1. feat(ui/admin): add missing color tokens + tokenize components.css (M1)
2. feat(ui): add light theme override block (M2)
3. feat(admin): add theme engine + settings toggle (M3)
4. refactor(admin): strip color literals from core modules (M4)
5. refactor(admin): strip remaining color literals + tokenize shell overlays (M5)
6. refactor(client): strip color literals from client CSS (M6)
7. feat: lock CSS color contract + promote toggle to TopBar + docs (M7)
```

---

## Full verification (post-M7)

```bash
npm run lint --workspace=admin
npm run test --workspace=admin
npm run build --workspace=admin

npm run lint --workspace=client
npm run test --workspace=client
npm run build --workspace=client

npm run lint --workspace=ui
npm run typecheck --workspace=ui
node scripts/check-css-color-literals.mjs  # must exit 0
```

Acceptance walk-through:
- Default load -> dark admin shell, no flash
- `/settings` toggle flips entire page to light
- Refresh page -> preference persists
- TopBar icon flips theme (post-M7)
- All pages render identically in both themes
- Client menus/game UI unaffected
