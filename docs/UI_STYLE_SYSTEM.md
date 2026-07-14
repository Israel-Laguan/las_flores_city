# UI Style System

> Permanent reference for the shared `@las-flores/ui` workspace and the styling contract between the `admin` panel and the game `client`.
>
> Replaces the historical milestone planning docs under `docs/refactor-milestones/` (deleted 2026-07-14). If you need historical context on *how* the system came to be, look at the commit history (M6 = extract CSS components, M7 = shared workspace); the **what** and the **why** are captured here.

## Overview

`@las-flores/ui` is the single source of truth for the project's design tokens, theme variables, base CSS, and reusable component classes. It is consumed by both the `admin` panel (Next.js) and the game `client` (Vite + Phaser).

Before the workspace existed, the same cyberpunk theme was duplicated three times (the old `dashboard` workspace, the new `admin` workspace, and the game `client`). The shared package removes that duplication and makes the "tokens + theme + component classes" model a hard contract.

It is **not** primarily a React component library — it is CSS-first with a tiny `cn()` helper. As of 2026-07-14, thin React wrappers (`Button`, `Input`, `Card`, `Badge`) are available as opt-in conveniences; they apply the same global classes that `cn(...)` would. See [Open follow-ups](#open-follow-ups).

## Package contract — `@las-flores/ui`

| Aspect | Value |
|---|---|
| Workspace directory | `ui/` |
| `package.json` `name` | `@las-flores/ui` |
| `type` | `module` (ESM) |
| `main` / `types` | `./src/index.ts` (sources are imported directly — no transpile step needed) |
| `exports."."` | `./src/index.ts` (re-exports `cn`, `ClassValue`, and the React wrappers `Button`, `Input`, `Card`, `Badge`) |
| `exports."./styles/*"` | `./src/styles/*` (CSS files imported by app bundles) |
| `exports."./lib/cn"` | `./src/lib/cn.ts` |
| Build | `npm run build --workspace=ui` → `tsc -p tsconfig.json && node ./scripts/copy-styles.mjs` (emits `dist/` for declarations + copies `src/styles/` → `dist/styles/`) |
| Consumers | `admin` (Next.js) and `client` (Vite) |

The `ui/src/` layout:

```text
ui/src/
├── index.ts          # re-exports { cn, ClassValue }
├── lib/
│   └── cn.ts         # the shared classname helper
└── styles/
    ├── tokens.css     # admin design tokens (--accent, --background, --space-*, --radius-*, …)
    ├── global.css     # base element styles (body, a, h1-h3, button, table, …) using tokens
    ├── components.css # shared reusable classes (.btn, .card, .table, .badge, .input, .error-box, …)
    └── themes.css     # client/phone theme variables (--color-*) toggled via body class
```

## How `admin` consumes the shared package

1. **TypeScript path mapping** — `admin/tsconfig.json` adds:
   ```json
   "paths": {
     "@las-flores/ui": ["../ui/src"]
   }
   ```
2. **Next transpile** — `admin/next.config.ts` includes the package in `transpilePackages` so Next can compile it together with the app:
   ```ts
   transpilePackages: ['@las-flores/shared', '@las-flores/ui'],
   ```
3. **Global stylesheets** — `admin/src/app/layout.tsx` imports the three admin-facing stylesheets, **in this order** (tokens first, then base, then components):
   ```ts
   import '@las-flores/ui/styles/tokens.css';
   import '@las-flores/ui/styles/global.css';
   import '@las-flores/ui/styles/components.css';
   ```
4. **`cn` helper** — imported from `@las-flores/ui` (re-exports the helper from `ui/src/lib/cn.ts`). No local copy remains.

The legacy `admin/src/app/globals.css` and `admin/src/styles/` directory are gone — all admin styling flows through the shared package.

## How `client` consumes the shared package

1. **Vite alias** — `client/vite.config.ts` adds:
   ```ts
   resolve: {
     alias: {
       '@las-flores/ui': resolve(__dirname, '../ui/src'),
     },
   },
   ```
2. **TypeScript path mapping** — `client/tsconfig.json` mirrors the alias under `compilerOptions.paths` so editors resolve the package.
3. **Theme stylesheet** — only the theme variables are pulled in for the game:
   ```ts
   import '@las-flores/ui/styles/themes.css';
   ```
   This is imported by:
   - `client/src/scenes/WorldScene.ts` (reads `--scene-bg`, `--scene-title`, `--scene-muted` from `getComputedStyle(document.body)`)
   - `client/src/components/SettingsView.ts` (theme selection UI)

Game-specific CSS stays local in `client/src/styles/`:

| File | Purpose |
|---|---|
| `phone.css`, `terminal-modal.css` | Phone UI |
| `map.css`, `city-nav.css` | Map + navigation |
| `comms.css`, `dialogue.css`, `feed.css` | In-game comms / dialogue / feed |
| `login.css`, `main-menu.css`, `view.css` | Auth + main-menu + generic view shell |
| `banco.css`, `trabajando.css`, `vault.css`, `glitch.css` | Game locations and effects |

These files reference the `--color-*` namespace (see [Theme variable namespace gotcha](#theme-variable-namespace-gotcha)).


## Shared component classes (from `ui/src/styles/components.css`)

The vocabulary available to **any** page (admin or client) that imports `components.css`:

| Group | Classes |
|---|---|
| Buttons | `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--danger`, `.btn--small`, `.btn--disabled` |
| Form controls | `.input`, `.textarea`, `.select` |
| Cards | `.card`, `.card__header`, `.card__title`, `.card__meta` |
| Tables | `.table`, `.table__th`, `.table__td` |
| Badges | `.badge`, `.badge--info`, `.badge--success`, `.badge--danger`, `.badge--warning`, `.badge--muted` |
| Sections | `.section`, `.section__heading` |
| Status boxes | `.error-box`, `.success-box`, `.warning-box` |
| Utility | `.muted`, `.subsection` |

**Composition pattern** (the convention established by the core primitives in `admin`):

```tsx
import { cn } from '@las-flores/ui';
import styles from './MyPage.module.css';

<button className={cn(styles.submit, 'btn', 'btn--primary')}>Save</button>
```

The shared class supplies the look; the page-level `.module.css` supplies only the layout / page-specific positioning. The core primitives that already follow this pattern are `ContentListPage`, `StoryBuilder`, `ContentCard`, and `AdminNav` in `admin/src/components/` and `admin/src/app/story-builder/`.

> **Incremental follow-up**: page-level `.module.css` files that still re-declare everything from scratch can be migrated to compose the shared classes mechanically. The pattern is established; the rest is busywork.


## Theme variable namespace gotcha

> ⚠️ **Read this before touching the theme CSS.** The two namespaces below are **deliberately separate**. Unifying them is **out of scope** and will break whichever side you touch first.

| Namespace | File | Owner | Example variables |
|---|---|---|---|
| `admin` (no prefix) | `ui/src/styles/tokens.css` | Next.js admin panel | `--accent`, `--background`, `--foreground`, `--muted`, `--panel-bg`, `--page-bg`, `--border`, `--danger`, `--warning`, `--info`, `--space-*`, `--radius-*`, `--shadow-glow`, `--text-*` |
| `client` (`--color-*`) | `ui/src/styles/themes.css` | Game client (phone, settings, world scene) | `--color-text`, `--color-bg`, `--color-page-bg`, `--color-border`, `--color-accent`, `--color-glow`, `--color-input-bg`, `--color-hover-bg`, `--status-bar-*`, `--scene-bg`, `--scene-title`, `--scene-muted` |

Both variable sets are defined in the **same shared package** and therefore cascade through the same DOM, but they do not collide because their names are disjoint. The phone UI additionally uses `--neon-*` vars that are set by the JS theme engine (`client/src/utils/themeEngine.ts`) at runtime — those are independent of both CSS files.

If a future refactor wants to unify the namespaces, it must update **both apps in a single coordinated change**:

- `client/src/styles/*.css` references to `--color-*` need to be retargeted to the unprefixed names.
- `admin` components that read theme variables (e.g. through `getComputedStyle`) need to be audited.
- Theme switch logic in `client/src/utils/themeEngine.ts` and any admin theme toggles need to use the same body-class contract.

This is deliberately deferred. **Do not rename one side without the other.**

## Open follow-ups

1. **Page-level `.module.css` migration (incremental)**: not all admin page modules compose the shared classes yet. The pattern is established by the core primitives and has at least one live consumer (`admin/src/app/login/`); the rest is mechanical. Track in follow-up issues, not in this doc.
2. **React wrappers — wider adoption**: `Button` / `Input` / `Card` / `Badge` are now in `@las-flores/ui` as opt-in conveniences. Adoption across the admin pages is a follow-up, not a blocker — pages that compose classes directly with `cn()` keep working unchanged.

## Verification commands

Run from the repo root after any styling change:

```bash
# Lint
npm run lint --workspace=admin
npm run lint --workspace=client

# Tests
npm run test --workspace=admin          # 76/76 at handoff

# Build
npm run build --workspace=ui            # emits dist/ + copies styles
npm run build --workspace=admin         # Next build
npm run build --workspace=client        # tsc + vite build (bundles @las-flores/ui)
```

All four must exit `0` before merging. A failing `npm run build --workspace=client` after a styling change usually means a CSS file in `ui/src/styles/` or `client/src/styles/` has a syntax error — Vite surfaces it as a transform failure.

## File map (quick reference)

| File | Holds |
|---|---|
| `ui/package.json` | Package contract (`name`, `type`, `exports`, `scripts`) |
| `ui/tsconfig.json` | TypeScript build config (emits `dist/`) |
| `ui/scripts/copy-styles.mjs` | Copies `src/styles/` → `dist/styles/` |
| `ui/src/index.ts` | Re-exports `{ cn }` and `ClassValue` |
| `ui/src/lib/cn.ts` | The `cn(...classes)` helper |
| `ui/src/styles/tokens.css` | **Admin** design tokens (no prefix) |
| `ui/src/styles/global.css` | Base element styles (consumes tokens) |
| `ui/src/styles/components.css` | Shared reusable classes |
| `ui/src/styles/themes.css` | **Client** theme variables (`--color-*`) |
| `admin/src/app/layout.tsx` | Imports `tokens.css` + `global.css` + `components.css` (order matters) |
| `admin/tsconfig.json` | `@las-flores/ui` → `../ui/src` |
| `admin/next.config.ts` | `transpilePackages: [..., '@las-flores/ui']` |
| `client/vite.config.ts` | `@las-flores/ui` → `../ui/src` alias |
| `client/tsconfig.json` | Matching `paths` entry |
| `client/src/scenes/WorldScene.ts` | Imports `@las-flores/ui/styles/themes.css` |
| `client/src/components/SettingsView.ts` | Imports `@las-flores/ui/styles/themes.css` |
| `client/src/styles/*.css` | Game-specific CSS (phone, map, terminal, comms, etc.) — uses `--color-*` |

