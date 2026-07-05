# Podman Workflow for Las Flores 2077 Development

This document documents common pitfalls and correct workflows when using Podman instead of Docker for the Las Flores 2077 project, based on encountered issues during development.

## Common Issues Encountered

1. **`podman lint` doesn't exist** - Unlike Docker, Podman doesn't have a built-in lint command. Use container-based linting instead.
2. **`--purpose` flag doesn't exist** - The `podman build --purpose` flag is Docker-specific and causes errors in Podman.
3. **npm workspace issues inside containers** - Using `--workspace` flags directly in `podman run` commands fails because the workspace configuration isn't available in the container's package.json context.
4. **Health check confusion** - Host-side `curl` can return exit code 56 due to stale docker-proxy state, even when the container is healthy.

## Correct Workflow

### Building the Server Image
```bash
# Correct Podman build command (no --purpose flag)
podman build -f ./server/Dockerfile -t las-flores-server .
```

### Running Lint, Build, and Tests Inside Container
Instead of trying to use `--workspace` flags directly (which fail), mount the source code and run commands inside the container:

```bash
# Lint the server code
podman run --rm -v $(pwd)/server:/app las-flores-server npm run lint

# Build the server code
podman run --rm -v $(pwd)/server:/app las-flores-server npm run build

# Run server tests (including integration tests)
podman run --rm -v $(pwd)/server:/app las-flores-server npm run test
```

> **Note**: The volume mount `$(pwd)/server:/app` makes the server source code available inside the container at `/app`, allowing npm commands to work correctly.

### Verifying Server Health
**Do NOT use host-side curl** due to potential docker-proxy issues:
```bash
# DO NOT USE (may return exit code 56 even when healthy):
# curl http://localhost:3000/health

# INSTEAD, use wget from inside the container:
podman exec las-flores-server wget -qO- http://localhost:3000/health
# Expected output: {"success":true,"data":{"status":"healthy",...}}
```

### Full Development Cycle
```bash
# 1. Build image
podman build -f ./server/Dockerfile -t las-flores-server .

# 2. Run lint
podman run --rm -v $(pwd)/server:/app las-flores-server npm run lint

# 3. Build
podman run --rm -v $(pwd)/server:/app las-flores-server npm run build

# 4. Run tests
podman run --rm -v $(pwd)/server:/app las-flores-server npm run test

# 5. Start development server (if needed)
podman run -d --name las-flores-server \
  --network las-flores-net -p 3000:3000 \
  -v ./server/src:/app/server/src \
  -v ./shared:/app/shared \
  -v ./content:/app/content \
  -v ./docs:/app/docs:ro \
  -e DATABASE_URL=postgresql://las_flores:las_flores_dev_password@10.89.0.3:5432/las_flores \
  -e ANALYTICS_DATABASE_URL=postgresql://las_flores_analytics:las_flores_analytics_dev_password@10.89.0.4:5432/las_flores_analytics \
  -e REDIS_URL=redis://10.89.0.5:6379 \
  -e MINIO_ENDPOINT=10.89.0.6 \
  -e MINIO_PORT=9000 \
  -e MINIO_ACCESS_KEY=minioadmin \
  -e MINIO_SECRET_KEY=minioadmin \
  -e JWT_SECRET=your-jwt-secret-change-in-production \
  las-flores-server

# 6. Verify health
podman exec las-flores-server wget -qO- http://localhost:3000/health
```

### Clean Shutdown
```bash
podman rm -f las-flores-server
podman rm -f las-flores-postgres-oltp
podman rm -f las-flores-postgres-olap
podman rm -f las-flores-redis
podman rm -f las-flores-minio
podman network rm las-flores-net
podman volume rm postgres-oltp-data postgres-olap-data redis-data minio-data
```

## Key Takeaways

1. **Avoid Docker-specific flags** like `--purpose` when using Podman
2. **Use volume mounts** for development workflows inside containers instead of relying on workspace flags
3. **Always verify health from inside the container** using `wget` or similar tools available in the container image
4. **Refer to AGENTS.md** for the complete Podman workflow setup, but apply the corrections documented here for day-to-day development

This documentation prevents rediscovering the same issues when switching between Docker and Podman environments or onboarding new team members.