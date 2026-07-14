# Milestone 7 — Shared `@las-flores/ui` workspace

**Goal:** Promote the styling foundation (tokens, themes, base component CSS) and optionally shared React components into a monorepo package that both `admin` and `client` import from. This eliminates the current 3-way duplication of the cyberpunk theme (`adminStyles.ts`, `admin/globals.css`, `client/themes.css`).

## Steps
1. Create `ui/` workspace:
   - `ui/package.json` → `"@las-flores/ui"`, `type: module`, exports `./dist/*`.
   - `ui/tsconfig.json`, `ui/build` (tsc or just CSS copy).
   - `ui/src/styles/tokens.css` ← port from `admin/src/styles/tokens.css`.
   - `ui/src/styles/themes.css` ← merge `admin` themes + `client/src/styles/themes.css` (dark, light/high-contrast).
   - `ui/src/styles/global.css`, `ui/src/styles/components.css` ← port from M2/M6.
   - `ui/src/lib/cn.ts` ← port `cn()` helper.
   - (Optional) `ui/src/components/` → `Button.tsx`, `Input.tsx`, `Card.tsx`, `Badge.tsx` (thin wrappers applying the global classes).
   - `ui/src/index.ts` re-exports.
2. Add `"ui"` to root `package.json` workspaces.
3. `admin`: replace local `tokens.css`/`global.css`/`components.css` imports with `@las-flores/ui/styles/*`. Import `@las-flores/ui/lib/cn`.
4. `client`: replace `client/src/styles/themes.css` (and related) imports with `@las-flores/ui/styles/*`. Keep game-specific CSS (phone, terminal, maps) local.
5. `shared` stays schema/types-only; `ui` is the presentation sibling.

## Notes
- `dashboard` (reference) can adopt `@las-flores/ui` later or be retired once `admin` is feature-complete after M5.
- CSS custom properties cascade across packages, so theme switching stays trivial (toggle body class).

## Verification
- `npm run build --workspaces`
- `npm run build --workspace=admin` and `npm run build --workspace=client` both green.
- Visual check: admin + client both respond to theme class toggle identically.