# Podman Documentation for Las Flores 2077

This directory contains Podman-specific documentation for setting up and managing the Las Flores development environment.

## Files

| File | Purpose | Format |
|------|---------|--------|
| [podman-ops.md](./podman-ops.md) | Behavioral agent enforcing correct Podman operational patterns (IP discovery, env vars, health checks, teardown) | Agent (YAML frontmatter + `prompt` body) |
| [podman-dev.md](./podman-dev.md) | Command reference for starting/stopping services and running tests | Command (YAML frontmatter + instruction body) |
| [SKILL.md](./SKILL.md) | Skill documenting common Podman pitfalls and the correct build/lint/test/health workflow | Skill |

## Why .agents/podman?

These files hold Podman operational knowledge for Las Flores 2077 in a
tool-agnostic location so any AI coding assistant can read them. They are
authored in the **Kilo agent/command format** (YAML frontmatter + markdown body)
so they can be lifted into `.kilo/agent/` or `.kilo/command/` verbatim if a
project wants Kilo to load them automatically.

## Quick Reference

### Start Everything (one command)
```bash
./start-stack.sh
```
This creates the network + volumes (if missing), starts all backing services,
builds + starts the server and admin containers, applies migrations, and waits.
It auto-discovers container IPs and injects them via `--add-host` so the server
can reach Postgres/Redis/MinIO by name inside its own container.

### Check Status
```bash
podman ps --filter name=las-flores
```

### Services (host-mapped ports)
- **Server:** http://localhost:3000
- **Admin UI:** http://localhost:3002  *(README previously said 3001 — the script maps admin to 3002)*
- **PostgreSQL OLTP:** localhost:5434
- **PostgreSQL OLAP:** localhost:5433
- **Redis:** localhost:6379
- **MinIO API:** localhost:9000 · **MinIO Console:** localhost:9001

### Health Check (authoritative)
Do **not** trust host-side `curl http://localhost:3000/health` — on this rootless
host it can return exit code 56 (failure to receive) even when the server is healthy.
The server image (node:18/20-alpine) has no `curl`, so verify **from inside the container**:
```bash
podman exec las-flores-server wget -qO- http://localhost:3000/health
# expected: {"success":true,"data":{"status":"healthy",...}}
```

### Run Tests (jump-in, no host toolchain needed)
The test runner spins up a `node:20` container on `--network host` so it reaches
the backing services via the host-mapped ports (localhost:5434/5433/6379). Paths
are **relative to the repo root and must include `server/`**:
```bash
# Unit + smoke (no DB migrations needed, but DB must be up)
./scripts/run-tests-podman.sh server/tests/unit
./scripts/run-tests-podman.sh server/tests/smoke

# Full integration suite (needs the stack running + migrations applied)
./scripts/run-tests-podman.sh server/tests/integration

# A single file
./scripts/run-tests-podman.sh server/tests/integration/story-builder-drafts.test.ts
```
Equivalent host command (if node + deps are installed locally):
`npm run test --workspace=server` (uses `.env` → localhost ports).

### Key Fixes Applied

1. **DNS Resolution:** Rootless Podman here has **no `aardvark-dns`** (you'll see a
   warning on every `podman run`). Container names do NOT resolve across containers.
   Two working patterns:
   - `start-stack.sh` injects names via `--add-host=<name>:<ip>` (works inside the server container).
   - Or put the raw IPs straight into the env vars (the pattern the server image expects):
     `DATABASE_URL=postgresql://...@<PG_OLTP_IP>:5432/...`, `REDIS_URL=redis://<REDIS_IP>:6379`,
     `MINIO_ENDPOINT=<MINIO_IP>`. Get IPs with `podman inspect <name>` (see podman-ops.md).
2. **PROMPT_ROOT:** Server needs explicit `PROMPT_ROOT="/app/content"` to find asset prompts. It scans `content/characters/*`, `content/locations/*`, `content/scenes/*`, etc.
3. **Admin in Container:** Admin UI runs in a podman container (port 3002), no host npm required.
4. **Migrations:** `./scripts/apply-migrations.sh both` uses `podman exec` against each DB container — it does NOT rely on container DNS, so it works here.
5. **JWT_SECRET:** Keep it consistent. The repo `.env` uses `JWT_SECRET=dev-secret`. `start-stack.sh` now passes `dev-secret` so dev-login and tests align. Don't use `your-jwt-secret-change-in-production` for local work.

## See Also

- [podman-dev.md](./podman-dev.md) - Start/stop command reference + testing
- [podman-ops.md](./podman-ops.md) - Operational guidelines (IP discovery, teardown)
- [../../docs/DEVELOPMENT_SETUP.md](../../docs/DEVELOPMENT_SETUP.md) - Complete setup guide with troubleshooting
