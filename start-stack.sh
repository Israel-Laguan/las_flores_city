#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------
# Configurable timeouts and delays
# -------------------------------------------------
MAX_STARTUP_ATTEMPTS=60
STARTUP_WAIT_MS=5000  # 5 seconds between attempts

# -------------------------------------------------
# 1. Cleanup existing containers
# -------------------------------------------------
podman rm -f las-flores-postgres-oltp las-flores-postgres-olap las-flores-redis \
  las-flores-minio las-flores-neo4j las-flores-server las-flores-intake-worker \
  las-flores-admin 2>/dev/null || true

# -------------------------------------------------
# 2. Create network and persistent volumes
# -------------------------------------------------
podman network exists las-flores-net || podman network create las-flores-net

podman volume exists postgres-oltp-data || podman volume create postgres-oltp-data
podman volume exists postgres-olap-data || podman volume create postgres-olap-data
podman volume exists redis-data || podman volume create redis-data
podman volume exists minio-data || podman volume create minio-data

# -------------------------------------------------
# Helper: Get container IP address
# -------------------------------------------------
get_container_ip() {
  local container_name="$1"
  podman inspect "$container_name" 2>/dev/null | jq -r '.[] | .NetworkSettings.Networks["las-flores-net"].IPAddress' 2>/dev/null
}

# Helper: wait for a container's /health to report success (in-container wget)
wait_health() {
  local container="$1"
  local port="$2"
  local attempt=0
  while true; do
    if podman exec "$container" wget -qO- "http://localhost:${port}/health" 2>/dev/null | grep -q '"success":true'; then
      echo "✅ $container is healthy"
      return 0
    fi
    echo "⏳ $container not healthy yet... waiting ${STARTUP_WAIT_MS}ms"
    sleep $((STARTUP_WAIT_MS/1000))
    attempt=$((attempt+1))
    if [ $attempt -ge $MAX_STARTUP_ATTEMPTS ]; then
      echo "❌ $container failed to become healthy after $MAX_STARTUP_ATTEMPTS attempts"
      return 1
    fi
  done
}

# -------------------------------------------------
# 3. Start backing services
# -------------------------------------------------
# PostgreSQL (OLTP) - wait until accepting connections
echo "🕒 Waiting for PostgreSQL OLTP to be healthy..."
podman run -d \
  --name las-flores-postgres-oltp \
  --network las-flores-net \
  -p 5434:5432 \
  -v postgres-oltp-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores \
  -e POSTGRES_USER=las_flores \
  -e POSTGRES_PASSWORD=las_flores_dev_password \
  docker.io/library/postgres:16-alpine

attempt=0
while true; do
  if podman exec las-flores-postgres-oltp pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "✅ PostgreSQL OLTP is ready"
    break
  fi
  echo "⏳ PostgreSQL OLTP not ready yet... waiting ${STARTUP_WAIT_MS}ms"
  sleep $((STARTUP_WAIT_MS/1000))
  attempt=$((attempt+1))
  if [ $attempt -ge $MAX_STARTUP_ATTEMPTS ]; then
    echo "❌ PostgreSQL OLTP failed to start after $MAX_STARTUP_ATTEMPTS attempts"
    exit 1
  fi
done

# PostgreSQL (OLAP)
podman run -d \
  --name las-flores-postgres-olap \
  --network las-flores-net \
  -p 5433:5432 \
  -v postgres-olap-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=las_flores_analytics \
  -e POSTGRES_USER=las_flores_analytics \
  -e POSTGRES_PASSWORD=las_flores_analytics_dev_password \
  docker.io/library/postgres:16-alpine

# Redis
podman run -d \
  --name las-flores-redis \
  --network las-flores-net \
  -p 6379:6379 \
  -v redis-data:/data \
  docker.io/library/redis:7-alpine

# MinIO
podman run -d \
  --name las-flores-minio \
  --network las-flores-net \
  -p 9000:9000 -p 9001:9001 \
  -v minio-data:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  docker.io/minio/minio:latest \
  server /data --console-address ":9001"

# Neo4j graph authoring canvas (M27). Internal-only; NEO4J_ENABLED defaults to
# false so boot never aborts when it is down. The default compose
# NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-neo4j} resolves to "neo4j/neo4j", which the
# image rejects — a real password must be supplied.
podman run -d \
  --name las-flores-neo4j \
  --network las-flores-net \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/lasfloresdev123 \
  -e NEO4J_server_memory_heap_max__size=512M \
  -e NEO4J_server_memory_pagecache_size=256M \
  docker.io/library/neo4j:5-community

# Get IP addresses of backing services for DNS resolution
OLTP_IP=$(get_container_ip las-flores-postgres-oltp)
OLAP_IP=$(get_container_ip las-flores-postgres-olap)
REDIS_IP=$(get_container_ip las-flores-redis)
MINIO_IP=$(get_container_ip las-flores-minio)
NEO4J_IP=$(get_container_ip las-flores-neo4j)

echo "📋 Backing service IPs:"
echo "   PostgreSQL OLTP: $OLTP_IP"
echo "   PostgreSQL OLAP: $OLAP_IP"
echo "   Redis:           $REDIS_IP"
echo "   MinIO:           $MINIO_IP"
echo "   Neo4j:           $NEO4J_IP"

# -------------------------------------------------
# 4. Build the single server image (runs BOTH server + intake-worker)
# -------------------------------------------------
podman build -t las-flores-server -f server/Dockerfile .

# Wait a moment for services to stabilize
sleep 2

# -------------------------------------------------
# 5. Start the intake-worker FIRST (migration owner, port 3001)
# -------------------------------------------------
# The intake-worker is the ONLY process that runs runAllMigrations() (SQL +
# content migration). The game-server reads tables it creates, so the
# intake-worker must be healthy before the game-server starts.
echo "🕒 Starting intake-worker (migration owner)..."
attempt=0
while true; do
  podman rm -f las-flores-intake-worker 2>/dev/null || true

  podman run -d \
    --name las-flores-intake-worker \
    --network las-flores-net \
    --add-host="host.containers.internal:host-gateway" \
    -p 3001:3001 \
    -v ./server/src:/app/server/src \
    -v ./shared:/app/shared \
    -v ./infra:/app/infra \
    -v ./content:/app/content \
    -v ./docs:/app/docs:ro \
    -e NODE_ENV=development \
    -e PORT=3001 \
    -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
    -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
    -e REDIS_URL="redis://$REDIS_IP:6379" \
    -e MINIO_ENDPOINT="$MINIO_IP" \
    -e MINIO_PORT="9000" \
    -e MINIO_PUBLIC_URL="http://localhost:9000" \
    -e MINIO_ACCESS_KEY="minioadmin" \
    -e MINIO_SECRET_KEY="minioadmin" \
    -e NEO4J_URI="bolt://$NEO4J_IP:7687" \
    -e NEO4J_USER="neo4j" \
    -e NEO4J_PASSWORD="lasfloresdev123" \
    -e NEO4J_ENABLED="true" \
    -e JWT_SECRET="dev-secret" \
    -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
    -e LITELLM_API_KEY="local-key" \
    -e LLM_MODEL="poolside/laguna-m.1" \
    -e LLM_PROVIDER="litellm" \
    las-flores-server npm run dev:intake --workspace=server || true

  if podman inspect las-flores-intake-worker >/dev/null 2>&1; then
    echo "✅ Intake-worker container started"
    break
  fi

  attempt=$((attempt+1))
  if [ $attempt -ge $MAX_STARTUP_ATTEMPTS ]; then
    echo "❌ Intake-worker failed to start after $MAX_STARTUP_ATTEMPTS attempts"
    exit 1
  fi
  echo "⏳ Intake-worker not running yet... waiting ${STARTUP_WAIT_MS}ms"
  sleep $((STARTUP_WAIT_MS/1000))
done

wait_health las-flores-intake-worker 3001

# -------------------------------------------------
# 6. Start the game-server (port 3000) — after intake-worker is healthy
# -------------------------------------------------
echo "🕒 Starting game-server..."
attempt=0
while true; do
  podman rm -f las-flores-server 2>/dev/null || true

  podman run -d \
    --name las-flores-server \
    --network las-flores-net \
    --add-host="host.containers.internal:host-gateway" \
    -p 3000:3000 \
    -v ./server/src:/app/server/src \
    -v ./shared:/app/shared \
    -v ./infra:/app/infra \
    -v ./content:/app/content \
    -v ./docs:/app/docs:ro \
    -e NODE_ENV=development \
    -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@$OLTP_IP:5432/las_flores" \
    -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@$OLAP_IP:5432/las_flores_analytics" \
    -e REDIS_URL="redis://$REDIS_IP:6379" \
    -e MINIO_ENDPOINT="$MINIO_IP" \
    -e MINIO_PORT="9000" \
    -e MINIO_PUBLIC_URL="http://localhost:9000" \
    -e MINIO_ACCESS_KEY="minioadmin" \
    -e MINIO_SECRET_KEY="minioadmin" \
    -e NEO4J_URI="bolt://$NEO4J_IP:7687" \
    -e NEO4J_USER="neo4j" \
    -e NEO4J_PASSWORD="lasfloresdev123" \
    -e NEO4J_ENABLED="true" \
    -e JWT_SECRET="dev-secret" \
    -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
    -e LITELLM_API_KEY="local-key" \
    -e LLM_MODEL="poolside/laguna-m.1" \
    -e LLM_PROVIDER="litellm" \
    las-flores-server || true

  if podman inspect las-flores-server >/dev/null 2>&1; then
    echo "✅ Server container started"
    break
  fi

  attempt=$((attempt+1))
  if [ $attempt -ge $MAX_STARTUP_ATTEMPTS ]; then
    echo "❌ Server failed to start after $MAX_STARTUP_ATTEMPTS attempts"
    exit 1
  fi
  echo "⏳ Server not running yet... waiting ${STARTUP_WAIT_MS}ms"
  sleep $((STARTUP_WAIT_MS/1000))
done

# -------------------------------------------------
# 7. Start the admin UI (Next.js 16 dev server) → intake-worker:3001
# -------------------------------------------------
# Build admin image
podman build -t las-flores-admin -f admin/Dockerfile .

# Run admin container. The admin talks to the intake-worker: the browser uses
# NEXT_PUBLIC_SERVER_URL (host:3001) and server-side route handlers use
# INTERNAL_SERVER_URL (intake-worker:3001, resolved via --add-host).
INTAKE_IP=$(get_container_ip las-flores-intake-worker)

podman run -d \
  --name las-flores-admin \
  --network las-flores-net \
  --add-host="las-flores-intake-worker:$INTAKE_IP" \
  -p 3002:3000 \
  -v ./admin/src:/app/admin/src \
  -v ./shared:/app/shared \
  -e NODE_ENV=development \
  -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
  -e INTERNAL_SERVER_URL=http://$INTAKE_IP:3001 \
  -e NEXT_PUBLIC_DEV_LOGIN_ENABLED=true \
  las-flores-admin

# -------------------------------------------------
# 8. Verify migrations (SQL-only; content migration ran in the intake-worker)
# -------------------------------------------------
./scripts/apply-migrations.sh verify || true

# -------------------------------------------------
# 9. Output success and health info
# -------------------------------------------------
echo "✅ Full stack is up:"
echo "   • Intake-worker: http://localhost:3001 (migrations + admin/AI/content)"
echo "   • Server:        http://localhost:3000"
echo "   • Admin UI:      http://localhost:3002 (try it!)"
echo "   • Health:        podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health"
echo "   • Health:        podman exec las-flores-server wget -qO- http://localhost:3000/health"

# Keep main process alive to maintain container lifecycle
while true; do
  sleep 10
done
