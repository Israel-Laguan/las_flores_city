# Admin Panel Manual QA Report

**Date:** 2026-07-27
**Environment:** Podman (container-based)
**Admin URL:** http://localhost:3002
**Server URL:** http://localhost:3000

## Setup Commands

```bash
# Full stack setup (databases + server + admin)
./scripts/podman-workflow.sh setup

# Or start admin separately after server is running
./scripts/podman-workflow.sh admin
```

## Issues Found

### Issue #1: No Dev Login for Admin Panel (FIXED)

**Severity:** High — blocks all manual QA without a known admin password

**Description:** The admin login page at `/login` only supported password-based `admin-login`, but no admin user exists with a known password in the current DB state. The server has `/auth/dev-admin-login` endpoint that doesn't require a password, but it was not wired up in the admin UI.

**Fix Applied:**
- Added `/admin/src/app/api/auth/dev-login/route.ts` — a dev-only endpoint that uses the server's `/auth/dev-admin-login` to create/login a dev admin user
- Added "DEV LOGIN" button to `/admin/src/app/login/page.tsx` (visible only in non-production)
- Added `devLoginBtn` style to `/admin/src/app/login/login.module.css`

**Verification:**
```bash
# After starting the stack, visit http://localhost:3002/login
# Click "DEV LOGIN" button
# Should redirect to dashboard with user info shown in TopBar
```

### Issue #2: Stats Show "..." Instead of Actual Counts (NOT FIXED)

**Severity:** Medium — homepage dashboard doesn't display content statistics

**Description:** The homepage stats show loading placeholders ("...") because the client-side `adminFetch` in `client-api.ts` cannot authenticate. The session cookie is set for the admin domain (`localhost:3002`) but API calls go to the server domain (`localhost:3000`), causing a cross-origin cookie mismatch.

**Root Cause:** The `adminFetch` function in `admin/src/lib/client-api.ts` uses `credentials: 'include'` but cookies set by the server on `localhost:3000` are not sent to `localhost:3002` requests. The server-side `api.ts` correctly reads cookies, but the client-side fetch doesn't share them.

**Affected Pages:**
- Homepage (`/`) — Quick Stats show "..."
- Any page using `adminFetch` for data loading

**Potential Fix:** Switch client-side API calls to use the server-side `api.ts` pattern (reads cookies server-side and forwards them), or configure CORS to allow credential sharing between the two origins.

### Issue #3: TopBar Shows "Login" Instead of User Info After Dev-Login (NOT FIXED)

**Severity:** Medium — user feedback is missing after authentication

**Description:** After dev-login, the TopBar still shows "Login" button instead of user info (username, role badge, logout button). This is the same cross-origin cookie issue as Issue #2.

**Root Cause:** The `getAdminUser()` function in `admin/src/lib/api.ts` reads the `jwt_session` cookie from the admin domain, but the cookie was set by the server on its own domain. The client-side `adminFetch` in `client-api.ts` doesn't include the server's cookie in requests.

### Issue #4: Podman Workflow Script Missing Admin Panel Startup (FIXED)

**Severity:** Medium — admin panel was not started by the workflow script

**Description:** The `podman-workflow.sh` script only started the server during `setup`, not the admin panel. Users had to manually start the admin container with correct environment variables.

**Fix Applied:**
- Added admin panel startup to the `setup` command in `scripts/podman-workflow.sh`
- Added new `admin` command to start admin panel independently
- Added admin container to the `cleanup` command
- Added `admin` to the help text

**Verification:**
```bash
./scripts/podman-workflow.sh setup    # Starts everything including admin
./scripts/podman-workflow.sh admin    # Start admin only (requires server running)
./scripts/podman-workflow.sh status   # Shows all containers including admin
./scripts/podman-workflow.sh clean    # Removes admin container too
```

### Issue #5: INTERNAL_SERVER_URL Must Point to Server Container IP (NOT FIXED)

**Severity:** Low — admin API calls fail if INTERNAL_SERVER_URL is wrong

**Description:** The admin container's `INTERNAL_SERVER_URL` environment variable must point to the server container's IP address on the podman network, not `localhost:3000`. The `podman-workflow.sh` now computes this dynamically.

**Current Workaround:** The setup script now auto-detects the server IP using `podman inspect`.

## Pages Tested

| Page | URL | Status | Notes |
|------|-----|--------|-------|
| Login | `/login` | Working | DEV LOGIN button visible in dev mode |
| Dashboard | `/` | Partial | Stats show "..." due to auth issue |
| Characters | `/characters` | Not tested | Requires auth to load data |
| Dialogues | `/dialogues` | Not tested | Requires auth to load data |
| Scenes | `/scenes` | Not tested | Requires auth to load data |
| Story Beats | `/story-beats` | Not tested | Requires auth to load data |
| Migration | `/migration` | Not tested | Requires auth to load data |
| Validation | `/validation` | Not tested | Requires auth to load data |
| Quality | `/quality` | Not tested | Requires auth to load data |
| Analytics | `/analytics` | Not tested | Requires auth to load data |
| Settings | `/settings` | Not tested | Requires auth to load data |

## Corrected Startup Procedure

### Quick Start (Podman)

```bash
# 1. Start the full stack (databases + server + admin)
./scripts/podman-workflow.sh setup

# 2. Verify server is healthy
podman exec las-flores-server wget -qO- http://localhost:3000/health

# 3. Open admin panel in browser
# http://localhost:3002

# 4. Click "DEV LOGIN" to authenticate
```

### Manual Startup (if needed)

```bash
# Start infrastructure services
podman start las-flores-postgres-oltp las-flores-postgres-olap las-flores-redis las-flores-minio

# Start server (with NODE_ENV for player seeding)
OLTP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-oltp)
# ... (see podman-workflow.sh setup command for full args)

# Start admin panel
./scripts/podman-workflow.sh admin
```

## Environment Variables Reference

### Server Container
| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://las_flores:las_flores_dev_password@<OLT_IP>:5432/las_flores` |
| `ANALYTICS_DATABASE_URL` | `postgresql://las_flores_analytics:las_flores_analytics_dev_password@<OLAP_IP>:5432/las_flores_analytics` |
| `REDIS_URL` | `redis://<REDIS_IP>:6379` |
| `MINIO_ENDPOINT` | `<MINIO_IP>` |
| `MINIO_PORT` | `9000` |
| `MINIO_ACCESS_KEY` | `minioadmin` |
| `MINIO_SECRET_KEY` | `minioadmin` |
| `JWT_SECRET` | `your-jwt-secret-change-in-production` |
| `NODE_ENV` | `development` |

### Admin Container
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3000` |
| `INTERNAL_SERVER_URL` | `http://<SERVER_IP>:3000` |

## Notes for Future QA Sessions

1. The dev-login feature makes manual QA much easier — no need to set up admin passwords
2. The cross-origin cookie issue (Issues #2 and #3) affects all client-side data fetching — consider using server-side API routes as a proxy
3. The `podman-workflow.sh` script now handles the full stack including admin panel
4. Always use `podman exec las-flores-server wget -qO- http://localhost:3000/health` for health checks (not curl — the alpine image has no curl)