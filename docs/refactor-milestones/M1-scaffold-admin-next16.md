# Milestone 1 — Scaffold new `admin` on Next 16 (structure + placeholders)

**Goal:** A clean Next 16 workspace with no business logic yet — just the skeleton, tooling, and direct-fetch API layer. The ~30 `route.ts` proxy pattern is deliberately NOT recreated.

## Steps
1. `admin/package.json`: `next@^16`, `react@^19`, `react-dom@^19`, `@types/react@^19`, `@types/react-dom@^19`. Keep `vitest` + testing-library for parity with `dashboard`.
2. `admin/tsconfig.json`: `@/*` → `./src/*`, `strict: true`, `jsx: preserve`, `moduleResolution: bundler`, `paths` for `@las-flores/shared`.
3. `next.config.ts`: `transpilePackages: ['@las-flores/shared']`; `rewrites()` only if asset proxy still needed.
4. `admin/src/app/layout.tsx`: async server component, `getAdminUser()` via `cookies()` (async in Next 15+).
5. `admin/src/middleware.ts`: auth guard — redirect to `/login` when no `jwt_session` cookie (same matcher as dashboard).
6. `admin/src/lib/api.ts`: **direct `fetch()` to Express** with `credentials: 'include'`; base URL from `process.env.NEXT_PUBLIC_SERVER_URL`. No cookie forwarding — relies on CORS + SameSite=None cookie. Replaces `dashboard/src/lib/adminApi.ts` + all `route.ts`.
7. Placeholder `page.tsx` stubs for every route (from dashboard's route tree): login, home, story-builder (+/plans), editor, lore, assets, coverage, quality, migration, settings, users, maps, scenes, dialogues, missions, characters, shops, vault, overlays, stories, story-beats, story-arc, content-linker, analytics, validation.
8. `admin/Dockerfile` (node:20-alpine), `admin/start.sh`; re-add `"admin"` to root `package.json` workspaces + `docker-compose.yml` service.
9. Verify: `next build` succeeds with placeholders.

## Key decisions
- Next 16 + React 19 from day one (Turbopack, async `cookies()`).
- **No API proxy** — client fetches Express directly via CORS.
- CSS-first (global tokens + CSS Modules), no inline `style={{}}`.

## Verification
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- `docker compose build admin && docker compose up -d admin`
- `docker exec las-flores-admin wget -qO- http://localhost:3000/api/health`