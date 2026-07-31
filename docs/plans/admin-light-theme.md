# Admin Light Theme — Feasibility & Migration Plan

> Analysis and phased plan for adding a light theme to the Las Flores 2077 admin panel.
>
> **Created**: 2026-07-30
> **Status**: Approved — see `docs/plans/admin-light-theme-milestones.md` for phased milestone plan (M1–M7)
> **Related**: `docs/UI_STYLE_SYSTEM.md`, `docs/ADMIN_ARCHITECTURE.md`, `client/src/utils/themeEngine.ts`, `ui/src/styles/tokens.css`, `AGENTS.md`

---

## 1. TL;DR — Verdict

**Yes, a light theme is feasible.** The admin's CSS-variable token system (`ui/src/styles/tokens.css`) is architecturally theme-ready, and a working light theme already ships in the game client (`ui/src/styles/themes.css` + `client/src/utils/themeEngine.ts`).

**However, it is not a one-line toggle.** The admin carries significant **hardcoded-color debt** — ~252 hex literals + ~78 `rgba()` literals across 59 CSS files — that bypass the token system. A naive `.theme-light { --accent: #000 }` override block would re-skin the navigation chrome correctly but leave the heavy pages (assets, quality, story-arc, diff, story-builder) with dark "islands" and low-contrast gray text. A color-debt sweep is the bulk of the work.

**Root cause — this is a contract-enforcement problem, not a light-theme problem.** `@las-flores/ui` was designed as the single source of truth for colors (`docs/UI_STYLE_SYSTEM.md`), but neither app honored that contract: the admin hardcodes ~252 hex + ~78 `rgba()` literals, and the **client is just as guilty** (~218 hex literals across `main-menu.css`, `feed.css`, `phone.css`, `map.css`, `comms.css`, …). The sweep is therefore **valuable with or without light theme** — it is the cost of enforcing the shared-package color contract. Once enforced, light/dark/solarized become trivial one-block additions to the UI package, each activated by a single body class. See §3 for the target architecture and the open namespace decision.

**Estimated effort:** ~7–10 hrs total (Phase 0–2 ship a working toggle in ~4 hrs; Phase 3 contract-enforcement sweep is ~3–5 hrs and can be incremental).

---

## 2. Current architecture findings

### 2.1 The token system is correct

All admin colors are **CSS custom properties on `:root`** in `ui/src/styles/tokens.css`:

```css
:root {
  --background: #0a0a0a;   --foreground: #ededed;  --muted: #888;
  --accent: #00ff00;       --panel-bg: #0d0d1a;    --page-bg: #1a1a2e;
  --border: #333;          --danger: #ff4444;      --warning: #ffaa00;
  --info: #0066ff;         --success: #22c55e;     /* + spacing, radii, text sizes */
}
```

`admin/src/app/layout.tsx` imports them in order — `tokens.css` → `global.css` → `components.css` — and every component that uses `var(--accent)`, `var(--panel-bg)`, etc. **would adapt automatically** if those variables were re-scoped under a light-theme selector.

### 2.2 The core admin shell is well-tokenized

The navigation chrome (sidebar, top bar, breadcrumbs, shell) reads colors **only** from tokens, so it would re-skin with near-zero work:

| File | Color source | Migration cost |
|---|---|---|
| `admin/src/components/AdminShell.module.css` | none (layout only) | none |
| `admin/src/components/Sidebar.module.css` | `var(--panel-bg)`, `var(--border)`, `var(--accent)`, `var(--foreground)`, `var(--muted)` | none (see §2.5 caveat) |
| `admin/src/components/TopBar.module.css` | same token set | none |
| `admin/src/components/Breadcrumbs.module.css` | tokens | none |

### 2.3 A working light-theme precedent already ships — in the game client

`ui/src/styles/themes.css` **already defines a complete light palette**:

```css
body.theme-white-high-contrast {
  --color-text: #000000;  --color-bg: #ffffff;   --color-page-bg: #ffffff;
  --color-border: #1a1a1a; --color-accent: #000000;
  --color-input-bg: #f0f0f0;  --color-hover-bg: #e0e0e0; ...
}
```

And `client/src/utils/themeEngine.ts` is a **working toggle**: it swaps a body class, persists to `localStorage('preferred-theme')`, and re-applies on boot. The mechanism and design language for a light theme exist today.

### 2.4 ⚠️ Two hard constraints from `AGENTS.md` / `UI_STYLE_SYSTEM.md`

1. **Namespace separation is deliberate.** The admin uses the **unprefixed** namespace (`--accent`, `--background`, `--border`); the client light theme overrides the **`--color-*`** namespace. Importing `themes.css` into admin would **not** affect it. The doc states these are *"deliberately separate — do NOT 'unify' them in a single PR."* **A light theme for admin must redefine the unprefixed tokens, not reuse the client's `--color-*` block.**

2. **The admin has zero theme infrastructure today.** No `prefers-color-scheme` query, no `data-theme`/body class, no toggle, no `localStorage`, no selector on the `/settings` page. All of that must be built for admin. (Do **not** attempt to unify namespaces with the client — out of scope and forbidden by the style contract.)

### 2.5 ⚠️ Hover overlays assume a dark canvas

Even in the well-tokenized shell, hover states use a **white-overlay** pattern — `rgba(255, 255, 255, 0.04)` (4×), `rgba(255, 255, 255, 0.06)` (3×), `rgba(255, 255, 255, 0.03)` (2×) — in `Sidebar.module.css` and `TopBar.module.css`. On a light background these become **invisible but harmless** (hover feedback disappears, nothing breaks). ~9 occurrences; should be converted to a `--hover-overlay` token.

---

## 3. Root cause — the color contract was never enforced (both apps)

The UI package was meant to own all color decisions; both apps bypass it. This is why theming is hard, and why the fix is valuable independently of light theme.

Full grep of `admin/src/**/*.css` (the client carries ~218 more hex literals of its own — see §3.4):

| Category | Count | Risk on light theme | Verdict |
|---|---|---|---|
| `#000` (text on accent/colored buttons) | 42 | Low — stays fine, buttons keep colored bg | **keep** |
| `#fff` (text on danger/dark surfaces) | 24 | Medium — invisible if bg becomes light | convert to token or verify bg stays dark |
| `#00ff00` (raw neon green, **not** `var(--accent)`) | 22 | Medium — clashes with a dark accent | **convert to `var(--accent)`** |
| `#aaa` / `#888` / `#666` / `#999` (dark-calibrated grays) | **58** | **High** — low contrast on white; `#999`/`#aaa` **fail WCAG AA** | **convert to `var(--muted)`** |
| Dark surface hex (`#1a1a2e`, `#0d0d1a`, `#222`, `#2a2a3a`, `#15151f`, `#0a0a14`, `#1c1c2a`, `#1f2937`) | ~15 | **High** — dark islands in a light page (visually broken) | **convert to `var(--panel-bg)`/`var(--page-bg)`** |
| `rgba(...)` literals (mostly status tints) | 78 | Medium — red/green tints survive; white-overlay ones don't | convert status tints to `--*-bg` tokens |

### 3.1 Where the debt clusters

The two genuinely breaking categories (dark surfaces + low-contrast grays) cluster in roughly **15–20 files**. Worst offenders:

| File | Issue |
|---|---|
| `app/(admin)/assets/assets.module.css` | hardcodes `background: #1a1a2e` + `color: #00ff00` + `color: #fff` |
| `app/(admin)/quality/quality.module.css` | gray-heavy (`#666`, `#aaa`, `#555`, `#222`), warning/danger tints |
| `app/(admin)/story-arc/story-arc.module.css` | `#555`, `#999`, `#666`, `#aaa`, `#0066ff` |
| `app/(admin)/diff/diff.module.css` | `#555`, `#999`, `#888`, `#ff0000`, `#ffaa00` |
| `app/(admin)/story-builder/**` | many `--surface*`/`--status-*` refs with dark fallbacks |
| `app/(admin)/lore/**` | `#000`, `#555`, `#999`, `#aaa`, neon-green tints |

### 3.2 A telling signal: the token system is already drifting

Several modules reference **variables that don't exist in `tokens.css`**, with dark inline fallbacks:

```css
background: var(--surface, #15151f);
border-color: var(--status-error, #ef4444);
background: var(--surface-raised, #1c1c2a);
background: var(--surface-2, #1f2937);
color: var(--text-muted, #8a8a9a);
background: var(--page-bg-alt, #f5f5f5);   /* ← already a LIGHT fallback! */
```

These `--surface*`, `--status-*`, `--text-*`, `--page-bg-alt`, `--warning-border`, `--accent-bg` tokens were **never added to `tokens.css`**. Notably, `plans.module.css` already uses a **light** fallback (`#f5f5f5`), showing someone already anticipated a lighter surface.

**Implication:** Defining these missing tokens properly (in *both* dark and light values) is a **prerequisite** — otherwise a light override block has nothing to override for those modules, and they keep rendering their dark fallbacks.

### 3.3 Token usage today (what already adapts automatically)

`var(--` references in admin CSS (top consumers):

```
221 var(--accent)        106 var(--muted)        96 var(--border)
 84 var(--space-*)        58 var(--font-mono)    55 var(--danger)
 47 var(--panel-bg)       15 var(--page-bg)      13 var(--radius-*)
 10 var(--foreground)      9 var(--danger-bg)     7 var(--warning)
```

~54 of 59 CSS files already use tokens — so most styling would re-skin correctly once the variable values flip. The debt is concentrated, not pervasive.

### 3.4 Target architecture — UI owns color, apps own structure

The goal is to make theme switching a **one-class change** with zero app CSS edits, and to make new themes (solarized, dim, …) a one-block addition to the UI package:

```text
@las-flores/ui  ← owns ALL color decisions
├── tokens.css      : token NAMES + default (dark) values on :root
├── themes.css      : body.theme-light { …same names… }
│                   : body.theme-solarized { …same names… }   ← N themes, one class each
├── global.css      : base elements, uses ONLY tokens
└── components.css  : .btn/.card/.table, uses ONLY tokens

admin / client      ← own structure ONLY
└── *.module.css    : layout, sizing, spacing, flex/grid, font-size, z-index
                      ZERO color / background / border-color / shadow-color literals
```

- **Theme switch = one body class** (`document.body.classList.toggle('theme-light')`). No app CSS changes.
- **Adding a theme later** (e.g. `theme-solarized`) = one new block in the UI package; zero app changes.
- **The contract becomes enforceable**: a grep/stylelint rule forbidding `#hex` / `rgba()` in `admin/src` and `client/src` CSS (allowlisted for the UI package itself) stops the drift from recurring. This is the single most important change — without it, any sweep regenerates debt.
- **App modules keep only structural CSS** — display, flex/grid, padding, margin, width/height, position, font-size. Color properties (`color`, `background`, `border-color`, colored `box-shadow`) move to tokens.

> **Caveat — `components.css` is not yet fully tokenized either.** It still has `#000`/`#fff` on `.btn--primary` and `.badge--*`. For true multi-theme these become tokens too (e.g. `--on-accent` = text drawn on the accent color), so a solarized theme can flip them in one place. A small tokenization pass on `components.css` belongs in the foundation (Phase 0/1), not the app sweep.

### 3.5 Open decision — namespace strategy (do NOT pick yet)

The admin uses the **unprefixed** namespace (`--accent`, `--background`, `--border`); the client uses `--color-*` (`themes.css`) plus `--neon-*` set at runtime by `themeEngine.ts`. `AGENTS.md`/`UI_STYLE_SYSTEM.md` state these are *"deliberately separate — do NOT unify them in a single PR."* The target architecture in §3.4 can be reached two ways, and this plan deliberately **does not choose** until reviewed:

- **Path A — per-namespace theme blocks (compliant today).** The unprefixed names get `theme-dark`/`theme-light`/`theme-solarized` blocks; the `--color-*` names get their own. Both live in the UI package. `AGENTS.md`'s "don't unify" rule stays intact. Delivers ~95% of the goal: centralized palettes, apps color-free, one-class switching, extensible to N themes. Does **not** give a single shared palette object both apps read identically.
- **Path B — fully unify the namespaces (forbidden today, bigger payoff).** Rename the client's `--color-*` → unprefixed everywhere, retire the client `themes.css`, both apps consume one theme file. Cleanest end state — but it is exactly the "coordinated change across both apps + `UI_STYLE_SYSTEM.md` + `AGENTS.md`" the docs deliberately deferred. Bigger blast radius, one-shot rename.

**Recommendation when the call is made:** Path A now (reversible, incremental), Path B as an optional later cleanup if the duplicated dark/light palettes across the two namespaces start to feel redundant. This is recorded as decision point §7 item 5.

---

## 4. Phased migration plan

### Phase 0 — Token hygiene (prerequisite) · ~1–2 hrs

Add the **missing tokens** to `ui/src/styles/tokens.css` so no module relies on its inline fallback. Define each in both dark (`:root`) and light (`body.theme-light`) values (Phase 1 adds the light block):

| Missing token | Dark value | Light value (proposed) |
|---|---|---|
| `--surface` | `#15151f` | `#ffffff` |
| `--surface-raised` | `#1c1c2a` | `#ffffff` |
| `--surface-2` | `#1f2937` | `#f0f0f2` |
| `--status-success` | `#10b981` | `#15803d` |
| `--status-error` | `#ef4444` | `#b91c1c` |
| `--status-warn` | `#f59e0b` | `#b45309` |
| `--status-success-bg` | `rgba(16,185,129,0.25)` | `rgba(21,128,61,0.12)` |
| `--status-error-bg` | `rgba(239,68,68,0.25)` | `rgba(185,28,28,0.12)` |
| `--text-muted` | `#8a8a9a` | `#555` |
| `--text-primary` | `#ededed` | `#111` |
| `--text-secondary` | `#aaa` | `#666` |
| `--page-bg-alt` | `#15151f` | `#f5f5f5` |
| `--border-color` | `#333` | `#cfcfd6` |
| `--warning-border` | `rgba(245,158,11,0.3)` | `rgba(180,83,9,0.4)` |
| `--accent-bg` | `rgba(0,200,150,0.15)` | `rgba(0,122,51,0.12)` |
| `--hover-overlay` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.06)` |

**Exit criteria:** every `var(--…)` reference in `admin/src/**/*.css` resolves to a defined token (no module falls back to an inline literal). Verify with: `grep -rIn 'var(--' admin/src --include='*.css'` and confirm each token exists in `tokens.css`.

### Phase 1 — Light token override block · ~1 hr

Add a scoped block to `ui/src/styles/tokens.css` redefining the **unprefixed** vars for light:

```css
body.theme-light {
  --background: #ffffff;
  --foreground: #111111;
  --muted: #555555;
  --accent: #007a33;        /* dark green for contrast on white */
  --panel-bg: #f7f7f8;
  --page-bg: #ececee;
  --border: #cfcfd6;
  --danger: #b91c1c;
  --warning: #b45309;
  --info: #1d4ed8;
  --success: #15803d;
  --disabled-bg: #d0d0d6;
  --disabled-text: #6b7280;
  --shadow-glow: 0 0 8px rgba(0, 0, 0, 0.12);
  --danger-bg: rgba(185, 28, 28, 0.10);
  --success-bg: rgba(21, 128, 61, 0.10);
  /* + all Phase 0 light values */
}
```

Scoped on `<body>` so it cascades over `:root`. Default remains dark (no class = `:root`).


### Phase 2 — Admin theme toggle · ~2 hrs

Mirror `client/src/utils/themeEngine.ts` but for the unprefixed namespace:

1. **`ThemeToggle` component** — a small button/select in the `TopBar` and/or `/settings` page (toggle Dark/Light, default Dark).
2. **Body class application** — set `document.body.classList.toggle('theme-light', isLight)`.
3. **Persistence** — `localStorage('lf-admin-theme')` (`'dark'` | `'light'`).
4. **SSR/hydration safety** — Next.js renders server-side; applying the class before mount causes a hydration mismatch. Use the **same pattern already in `AdminShell.tsx`** for the sidebar collapse pref: read `localStorage` in a `useEffect` after mount, set state, and add `suppressHydrationWarning` to `<body>` in `layout.tsx`. Optionally inject a tiny blocking `<script>` in `<head>` to apply the class pre-paint (avoids a flash of dark theme) — recommended for UX but adds complexity.
5. **`prefers-color-scheme`** (optional) — default new users to OS preference: `window.matchMedia('(prefers-color-scheme: light)')`. Only when no stored pref exists.

> **Reuse opportunity:** `restorePersistedTheme()` in `themeEngine.ts` is client-only and uses the `--color-*` namespace, so it can't be imported directly. Write a small admin `themeEngine.ts` (~40 lines) following the same shape. Keep it in `admin/src/lib/` to avoid coupling to the client workspace.

### Phase 3 — Enforce the color contract (strip app color literals) · ~3–5 hrs (the bulk, can be incremental)

This is the **root-cause fix** — valuable with or without light theme. Strip hardcoded color literals from app CSS so apps own structure only (§3.4). Applies to **both** admin and client — the client's ~218 hex literals are the same class of debt and should be swept in the same effort (or a parallel one). Replace literals with tokens across the affected modules:

- **Convert** `#00ff00` (22×) → `var(--accent)`
- **Convert** `#aaa`/`#888`/`#666`/`#999`/`#555` (58×) → `var(--muted)` / `var(--text-secondary)` / `var(--disabled-text)`
- **Convert** dark surface hex (15×) → `var(--panel-bg)` / `var(--page-bg)` / `var(--surface)`
- **Convert** `rgba(255,255,255,…)` hover overlays (9×) → `var(--hover-overlay)`
- **Convert** status tints → `var(--danger-bg)` / `var(--success-bg)` / `var(--warning-bg)`
- **Keep** `#000`/`#fff` on colored buttons (they survive — buttons keep a colored bg in both themes) **unless** the bg is now light, in which case swap to a token.

**Tackle file-by-file; each file is independently mergeable.** Suggested order (worst first): `assets`, `quality`, `story-arc`, `diff`, `story-builder/**`, `lore/**`, then the long tail.

**Per-file checklist:** grep the file for `#` and `rgba(`; replace each with a token; keep `#000`/`#fff` only where a colored/contrast bg guarantees legibility in both themes.

**Lock the contract so the debt cannot return:** add a grep/stylelint guard forbidding `#hex` and `rgba()` in `admin/src/**/*.css` and `client/src/**/*.css` (allowlisted for `ui/src/styles/**`). Wire it into `npm run lint` for both workspaces. This is the single change that makes the sweep permanent — without it, any sweep regenerates debt over time.

### Phase 4 — Verify · ~30 min

Per `docs/UI_STYLE_SYSTEM.md §Verification commands`, all must exit 0:

```bash
npm run lint --workspace=admin
npm run test --workspace=admin
npm run build --workspace=ui        # emits dist/ + copies styles
npm run build --workspace=admin     # Next build
```

Then a **visual smoke test** of:
- Shell: sidebar, top bar, breadcrumbs (Phase 1–2 deliverable)
- Heavy modules in **both** themes: `assets`, `quality`, `story-arc`, `diff`, `story-builder`, `lore`, `settings`, `analytics`
- Login page (`admin/src/app/login/`)

Optionally run a quick WCAG contrast check on `--accent`/`--muted`/`--text-*` against `--page-bg`/`--panel-bg` in light mode.

---

## 5. Scope boundaries (what is NOT in this plan)

- **Namespace unification (Path B) — deferred, not forbidden.** Not chosen in this plan — see §3.5 / §7 item 5. Path A keeps the two namespaces separate; Path B (renaming `--color-*` → unprefixed across the client, retiring `themes.css`, updating `UI_STYLE_SYSTEM.md` + `AGENTS.md`) is a separate decision waiting on review.
- **Client color-debt sweep IS in scope.** The client's ~218 hardcoded hex literals are the same contract violation as the admin's and should be swept in Phase 3 (parallel effort). What stays untouched is the client's `themeEngine.ts` runtime mechanism and its `--neon-*` JS-set variables.
- **Server/database changes.** None. Theme preference is client-side `localStorage` only (mirrors the client's existing pattern). No `users.preferred_theme` column, no API.
- **Additional theme variants beyond light** (e.g. "solarized", "dim"). Light is the v1 target; but the architecture (§3.4) is designed so each new theme is one block in the UI package with zero app changes — solarized is called out as the extensibility proof, not a v1 deliverable.
- **Renaming tokens (under Path A).** The unprefixed namespace stays; we only add `body.theme-light` (and later `theme-solarized`) override blocks. Path B would rename — see above.
- **Auto-detection as the only default.** `prefers-color-scheme` is an *optional* first-run hint; the explicit toggle + stored pref take precedence. Default remains dark to preserve the current admin aesthetic.

---

## 6. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Light theme ships but heavy pages look broken (dark islands) | High if Phase 3 skipped | Ship Phases 0–2 as "beta" toggle visible only in `/settings`, gate full rollout on Phase 3 completion |
| `--accent: #00ff00` fails WCAG on white | Certain | Use darker `#007a33` for light (decision in §4 Phase 1) |
| Hydration mismatch / flash of dark theme | Medium | Post-mount `useEffect` + `suppressHydrationWarning` (proven pattern in `AdminShell.tsx`); optional blocking head script |
| `#fff` text becomes invisible on a lightened bg | Medium | Per-file review in Phase 3; swap to `var(--foreground)` where bg is now light |
| Hover feedback disappears (white-overlay on light) | Low impact | `--hover-overlay` token flips to black-overlay in light |
| Token drift (Phase 0) uncovers more missing tokens | Low | Phase 0 exit grep catches them; iterative |

---

## 7. Decision points — resolved (see `docs/plans/admin-light-theme-milestones.md`)

| # | Question | Decision |
|---|---|---|
| 1 | Light `--accent` | `#007a33` (WCAG AA on white) |
| 2 | Toggle placement | `/settings` row only during beta; TopBar icon promoted after M5 |
| 3 | `prefers-color-scheme` on first run | Always dark in v1 (no OS auto-detect) |
| 4 | Rollout | Beta behind `/settings` until Phase 3 sweep completes |
| 5 | Namespace strategy | **Path A** — per-namespace theme blocks in `@las-flores/ui`; do not unify `--color-*` with unprefixed namespace |

---

## 8. File map (quick reference)

| File | Role in this plan |
|---|---|
| `ui/src/styles/tokens.css` | **Phase 0 + 1**: add missing tokens + `body.theme-light` override block (+ `--on-accent` for `components.css`) |
| `ui/src/styles/global.css` | Read-only review (uses tokens; auto-adapts) |
| `ui/src/styles/components.css` | **Phase 0/1**: tokenize remaining `#000`/`#fff` on `.btn--primary`/`.badge--*` → `--on-accent`/`--on-danger` so multi-theme works |
| `ui/src/styles/themes.css` | **Do not import into admin** — client `--color-*` namespace. Path A (§3.5) adds `theme-light`/`theme-solarized` blocks here for the client; Path B retires it |
| `admin/src/**/*.css` (all modules) | **Phase 3**: strip all `#hex`/`rgba()` color literals → tokens; keep only structural CSS |
| `client/src/**/*.css` (all modules) | **Phase 3 (parallel)**: same sweep — ~218 hex literals are the same class of debt |
| `admin/src/app/layout.tsx` | **Phase 2**: `suppressHydrationWarning` on `<body>`; optional blocking head script |
| `admin/src/components/TopBar.tsx` (+ `.module.css`) | **Phase 2**: toggle UI; **Phase 3**: `rgba(255,255,255,…)` → `--hover-overlay` |
| `admin/src/components/Sidebar.module.css` | **Phase 3**: hover overlays → `--hover-overlay` |
| `admin/src/components/AdminShell.tsx` | Reference for the post-mount `localStorage` hydration pattern |
| `admin/src/lib/themeEngine.ts` | **Phase 2**: new file (~40 lines), mirrors client shape, unprefixed namespace |
| `admin/src/app/(admin)/settings/*` | **Phase 2**: theme selector row (optional, if not TopBar-only) |
| `client/src/utils/themeEngine.ts` | Reference only — **do not import** (different namespace + client deps) |
| lint config (`admin` + `client`) | **Phase 3**: add the no-color-literals-in-app-CSS guard that locks the contract |

---

## 9. Suggested execution order

1. **Confirm decision points (§7)** — especially item 5 (namespace strategy).
2. **Phase 0** (token hygiene, incl. `components.css` → `--on-accent`) — prerequisite, unblocks everything.
3. **Phase 1 + 2** (light block + toggle) — ship a working toggle on the shell + tokenized pages; mark as beta in `/settings`.
4. **Phase 3** (enforce the color contract) — strip color literals from **both** apps, file-by-file, independently mergeable; finish with the lint guard that locks the contract.
5. **Phase 4** (verify) — lint/test/build + visual smoke in both themes.

**Reframing note:** Phase 3 is the *investment* (contract enforcement, valuable with or without light theme); light/dark/solarized are the *payoffs*. A "partial light theme" (shell + tokenized pages) is achievable in ~half a day (Phases 0–2) and degrades gracefully; the heavy pages remain dark until swept in Phase 3. Once the contract is locked, adding `theme-solarized` later is a single block in the UI package with zero app changes.
> **Note on `--accent` for light:** The neon green `#00ff00` fails WCAG AA on white. A darker green (`#007a33`, contrast ~4.5:1 on white) is proposed. If the cyberpunk neon identity must be preserved, keep `--accent: #00802b` as a compromise and accept AA-large-only. **Decision needed.**