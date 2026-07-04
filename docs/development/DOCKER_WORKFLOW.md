# Docker/Podman Workflow Guide

This guide covers Docker/Podman workflow topics including container builds, testing, and troubleshooting.

## Building Container Images

### Build Context Matters

The build context (the `.` at the end of `podman build`) determines where COPY instructions resolve paths.

```bash
# Context: ./server (correct for server/Dockerfile)
podman build -t las-flores-server -f server/Dockerfile ./server

# Context: project root (requires different Dockerfile paths)
podman build -t las-flores-server -f server/Dockerfile .
```

### Common Build Issue

**Error:**
```
Error: COPY ./server/package*.json ./server/: 
Rel: can't make relative to /home/anthony/code/las_flores_city/server
```

**Cause:** Build context is `./server` but Dockerfile has:
```dockerfile
COPY ./server/package*.json ./server/
```

This resolves to `./server/server/package.json` (doesn't exist).

**Fix:** When context is `./server`, the Dockerfile should use paths relative to that context:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files from build context (./server)
COPY package.json ./
COPY ./shared/package.json ./shared/
COPY ./client/package.json ./client/
COPY ./admin/package.json ./admin/

RUN npm ci

# Copy configuration files
COPY .eslintrc.json ./
COPY tsconfig.json ./

# Copy source code
COPY client/ ./client/
COPY admin/ ./admin/
COPY server/ ./server/
COPY shared/ ./shared/
COPY docs/ ./docs/

RUN npm run build --workspace=shared && npm run build --workspace=server

EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=server"]
```

### Verification

```bash
# Verify file exists at expected location
ls -la server/package.json

# Rebuild with correct context
podman build -t las-flores-server -f server/Dockerfile ./server
```

### Alternative: Change Build Context

If you prefer to keep original Dockerfile paths, use project root as context:
```bash
podman build -t las-flores-server -f server/Dockerfile .
```

## Running Tests with Podman

Run tests in a containerized environment that matches CI:

```bash
# Run specific test file
./scripts/run-tests-podman.sh server/tests/integration/assets.test.ts

# Run test suite
./scripts/run-tests-podman.sh server/tests/integration/

# Run all server tests
./scripts/run-tests-podman.sh server/tests/
```

### Prerequisites for Podman Testing

1. Running backing services (PostgreSQL, Redis, MinIO)
2. Proper environment variables set
3. Network connectivity between containers

See `./scripts/run-tests-podman.sh --help` for options.

## Container Development Tips

1. **Live reloading:** Volume-mount source directories for hot-reload support
2. **Container logs:** `podman logs <container-name>`
3. **Exec into container:** `podman exec -it <container-name> bash`
4. **Clean rebuild:** `podman build --no-cache -t <tag> -f <dockerfile> <context>`

## Related Docs

- [Development Setup](../DEVELOPMENT_SETUP.md) - Full stack setup
- [Testing Guide](./TESTING_GUIDE.md) - Running tests locally and in containers