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
podman rm -f las-flores-postgres-oltp las-flores-postgres-olap las-flores-redis las-flores-minio las-flores-server 2>/dev/null || true

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

# Get IP addresses of backing services for DNS resolution
OLTP_IP=$(get_container_ip las-flores-postgres-oltp)
OLAP_IP=$(get_container_ip las-flores-postgres-olap)
REDIS_IP=$(get_container_ip las-flores-redis)
MINIO_IP=$(get_container_ip las-flores-minio)

echo "📋 Backing service IPs:"
echo "   PostgreSQL OLTP: $OLTP_IP"
echo "   PostgreSQL OLAP: $OLAP_IP"
echo "   Redis:           $REDIS_IP"
echo "   MinIO:           $MINIO_IP"

# -------------------------------------------------
# 4. Build and start the server
# -------------------------------------------------
podman build -t las-flores-server -f server/Dockerfile .

# Wait a moment for services to stabilize
sleep 2

# Start server container with retry logic
attempt=0
while true; do
  # Remove existing server container if exists
  podman rm -f las-flores-server 2>/dev/null || true
  
  podman run -d \
    --name las-flores-server \
    --network las-flores-net \
    --add-host="las-flores-postgres-oltp:$OLTP_IP" \
    --add-host="las-flores-postgres-olap:$OLAP_IP" \
    --add-host="las-flores-redis:$REDIS_IP" \
    --add-host="las-flores-minio:$MINIO_IP" \
    -p 3000:3000 \
    -v ./server/src:/app/server/src \
    -v ./shared:/app/shared \
    -v ./content:/app/content \
    -v ./docs:/app/docs:ro \
    -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@las-flores-postgres-oltp:5432/las_flores" \
    -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@las-flores-postgres-olap:5432/las_flores_analytics" \
    -e REDIS_URL="redis://las-flores-redis:6379" \
    -e MINIO_ENDPOINT="las-flores-minio" \
    -e MINIO_PORT="9000" \
    -e MINIO_ACCESS_KEY="minioadmin" \
    -e MINIO_SECRET_KEY="minioadmin" \
    -e JWT_SECRET="your-jwt-secret-change-in-production" \
    -e PROMPT_ROOT="/app/docs/lore/assets/ui-concepts" \
    las-flores-server || true
    
  # Check if container exists and is running
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
# 5. Start the admin UI (Next.js 16 dev server)
# -------------------------------------------------
# Build admin image
podman build -t las-flores-admin -f admin/Dockerfile .

# Run admin container
SERVER_IP=$(get_container_ip las-flores-server)

podman run -d \
  --name las-flores-admin \
  --network las-flores-net \
  --add-host="las-flores-server:$SERVER_IP" \
  -p 3002:3000 \
  -v ./admin:/app/admin \
  -v ./shared:/app/shared \
  -e NODE_ENV=development \
  -e NEXT_PUBLIC_SERVER_URL=http://las-flores-server:3000 \
  las-flores-admin

# -------------------------------------------------
# 6. Apply DB migrations
# -------------------------------------------------
./scripts/apply-migrations.sh both

# -------------------------------------------------
# 7. Output success and health info
# -------------------------------------------------
echo "✅ Full stack is up:"
echo "   • Server:   http://localhost:3000"
echo "   • Admin UI:     http://localhost:3002 (try it!)"
echo "   • Health:   Run 'curl http://localhost:3000/health' or check Vite console"

# Keep main process alive to maintain container lifecycle
while true; do
  sleep 10
done
