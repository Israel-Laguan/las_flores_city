# Milestone 0 — Rename `admin` → `dashboard` (living reference)

**Goal:** Keep the currently working admin app intact, but under a new name (`dashboard`) so it can serve as a living reference while we rebuild `admin` from scratch on Next 16.

## Status: Complete

## Steps
1. `git mv admin dashboard` - preserves git history
2. Updated root `package.json` workspaces: `"admin"` → `"dashboard"`, `dev:admin` → `dev:dashboard`
3. Updated `docker-compose.yml`: service `admin` → `dashboard`, container name, dockerfile path, volume mounts
4. Updated `docker-compose.prod.yml`: service, command path, container references
5. Updated `dashboard/Dockerfile`: all internal paths (`/app/admin` → `/app/dashboard`)
6. Updated helper scripts: `dev-cleanup.sh`, `start-stack.sh`
7. Updated `.github/workflows/ci.yml`: `workspace=admin` → `workspace=dashboard`
8. Updated documentation: `ADMIN_PANEL.md`, `DEVELOPMENT_SETUP.md`, `DOCKER_INTEGRATION.md`, lore references
9. Updated `dashboard/package.json` name field
10. Updated `server/tests/integration/admin-content-preservation.test.ts` for new workspace name
11. Updated `.agents/podman/podman-dev.md`

## Verification
- `npm run lint --workspace=dashboard`
- `npm run build --workspace=dashboard`
- `docker compose build dashboard && docker compose up -d dashboard`
- `docker exec las-flores-dashboard wget -qO- http://localhost:3000/api/health`

## Notes
- Express server `/admin/*` routes are NOT affected — only the Next.js app dir/workspace is renamed.
- Server middleware (`adminAuth.ts`), DB role checks, and API paths all remain unchanged.
- `dashboard` is the reference; no new features after M0.
- M1-M7 milestone docs intentionally reference `workspace=admin` for the future Next 16 rebuild.
