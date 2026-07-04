# Podman Documentation for Las Flores 2077

This directory contains Podman-specific documentation for setting up and managing the Las Flores development environment.

## Files

| File | Purpose | Source |
|------|---------|--------|
| [podman-ops.md](./podman-ops.md) | Operational guidelines for Podman-based deployments | Moved from `.kilo/agent/podman-ops.md` |
| [podman-dev.md](./podman-dev.md) | Command reference for starting/stopping services | Moved from `.kilo/command/podman-dev.md` |

## Why .agents/podman?

These files were originally in `.kilo/` directories which are specific to the Kilo Code agent. By moving them to `.agents/podman/`, they become accessible to **all agents** including:

- Mistral Vibe (you)
- Kilo Code
- Any other AI coding assistants

This ensures consistent Podman operational knowledge across all agents working on this project.

## Quick Reference

### Start Everything
```bash
./start-stack.sh
```

### Check Status
```bash
podman ps --filter name=las-flores
```

### Services
- **Server:** http://localhost:3000
- **Admin UI:** http://localhost:3001
- **PostgreSQL OLTP:** localhost:5434
- **PostgreSQL OLAP:** localhost:5433
- **Redis:** localhost:6379
- **MinIO:** http://localhost:9001

### Key Fixes Applied

1. **DNS Resolution:** Podman doesn't have container name DNS. Use `--add-host` with IP addresses from `podman inspect`
2. **PROMPT_ROOT:** Server needs explicit `PROMPT_ROOT="/app/docs/lore/assets/ui-concepts"` to find asset prompts
3. **Admin in Container:** Admin UI runs in podman container, no host npm required
4. **Migrations:** Script uses `podman` instead of `docker`

## See Also

- [../../docs/DEVELOPMENT_SETUP.md](../../docs/DEVELOPMENT_SETUP.md) - Complete setup guide with troubleshooting
