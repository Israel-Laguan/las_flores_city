# Fix for Dockerfile Build Context Issue

## Problem
When building the server image with:
```bash
podman build -t las-flores-server -f server/Dockerfile ./server
```

The build context is set to `./server`, but the Dockerfile contains incorrect paths that assume the build context is the project root.

## Error Message
```
Error: building at STEP "COPY ./server/package*.json ./server/": checking on sources under "/home/anthony/code/las_flores_city/server": Rel: can't make  relative to /home/anthony/code/las_flores_city/server; copier: stat: ["/server/package*.json"]: no such file or directory
```

## Root Cause
In the Dockerfile:
```dockerfile
COPY ./server/package*.json ./server/
```

When build context is `./server`, this resolves to:
`./server/server/package.json` (which doesn't exist)

## Solution
Update the Dockerfile to use correct relative paths based on the build context being `./server`:

### Correct Dockerfile (server/Dockerfile)
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

## Verification Steps
1. Check that `server/package.json` exists:
   ```bash
   ls -la server/package.json
   ```

2. Rebuild the image:
   ```bash
   podman build -t las-flores-server -f server/Dockerfile ./server
   ```

3. If successful, continue with stack startup:
   ```bash
   ./start-stack.sh
   ```

## Alternative Fix (Change Build Context)
If you prefer to keep the original Dockerfile paths, change the build context to the project root:
```bash
podman build -t las-flores-server -f server/Dockerfile .
```

Then update the start-stack.sh script accordingly.