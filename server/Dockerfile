FROM node:20-alpine

WORKDIR /app

# Copy package files from project root
COPY package.json ./package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY infra/package.json ./infra/package.json
COPY client/package.json ./client/package.json
COPY admin/package.json ./admin/package.json

# Install dependencies FIRST to create package-lock.json
RUN npm install --no-save

# Copy source files
COPY .eslintrc.json ./.eslintrc.json
COPY tsconfig.json ./tsconfig.json
COPY client ./client
COPY admin ./admin
COPY server ./server
COPY shared ./shared
COPY infra ./infra
COPY docs ./docs
# Content directory holds the world lore markdown (content/lore/), entity YAML
# files, and staged assets needed by the server in production (content migration,
# admin lore endpoints, asset publishing). In dev, docker-compose bind-mounts
# ./content over this; in production the baked-in copy is the sole source.
COPY content ./content

# Build workspaces
RUN npm run build --workspace=shared && npm run build --workspace=infra && npm run build --workspace=server

# EXPOSE 3000 = game-server (slim), 3001 = intake-worker (admin + AI + content).
# The same image runs both processes; docker-compose selects the entrypoint via
# `command:`. See docs/milestones/M21-process-split.md.
EXPOSE 3000 3001

# Default entrypoint is the slim game-server. The intake-worker is started with
# `npm run start:intake --workspace=server` (see docker-compose.yml).
CMD ["npm", "run", "dev", "--workspace=server"]
