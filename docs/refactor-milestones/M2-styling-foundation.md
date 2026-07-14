# Milestone 2 — Styling foundation (global CSS + design tokens)

**Goal:** Establish the CSS-first convention before any real page is built. Port the theme system from `client/src/styles/themes.css`.

## Steps
1. `admin/src/styles/tokens.css`: CSS custom properties for colors, spacing, typography, radii, shadows, z-index. Dark cyberpunk as default.
2. `admin/src/styles/global.css`: base element styles (body, a, h1–h3, button, table, section, ul/li) using the tokens. Replaces `dashboard/src/app/globals.css` (49 lines of inline hex).
3. Themes: `body.theme-dark` (cyberpunk green), `body.theme-white-high-contrast` (ported from `client/src/styles/themes.css`), applied via body class.
4. `admin/src/lib/cn.ts`: `cn(...classes)` conditional-classname helper (filters falsy, joins with space).
5. Document the rule in `docs/ADMIN_PANEL.md`: **no inline `style={{}}`** — use global classes or `.module.css`. The `adminStyles.ts` object pattern from dashboard is retired.

## Notes
- Keep tokens framework-agnostic so they can later move into `@las-flores/ui` (M7).
- `global.css` imported once in `layout.tsx`.

## Verification
- `next build` still green.
- Manual: toggle body class, confirm dark/light themes apply.