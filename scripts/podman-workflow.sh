#!/bin/bash
#
# podman-workflow.sh - Complete Podman workflow for Las Flores 2077
#
# Usage:
#   ./scripts/podman-workflow.sh [command]
#
# Commands:
#   setup       - Initial setup (build images, start services, apply migrations)
#   test        - Run all tests (lint, build, server tests, e2e)
#   lint        - Run linting only
#   build       - Build all workspaces
#   server-test - Run server tests only
#   e2e         - Run E2E tests (requires server running)
#   clean       - Clean up containers and volumes
#   status      - Show status of all services
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${BLUE}$1${NC}"; }

# Check if podman is available
check_podman() {
    if ! command -v podman &> /dev/null; then
        log_error "Podman is not installed"
        exit 1
    fi
    log_info "Podman version: $(podman --version)"
}

# Check if podman-compose is available
check_compose() {
    if ! command -v podman-compose &> /dev/null; then
        log_warn "podman-compose not found, using podman directly"
        return 1
    fi
    log_info "podman-compose version: $(podman-compose --version)"
    return 0
}

# Wait for a container to be healthy (uses HEALTHCHECK if available)
wait_healthy() {
    local container="$1"
    local max_wait="${2:-60}"
    local count=0

    log_info "Waiting for $container to be healthy..."
    while [ $count -lt $max_wait ]; do
        local status=$(podman inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
        if [ "$status" = "healthy" ]; then
            log_info "$container is healthy"
            return 0
        fi
        sleep 2
        count=$((count + 2))
    done

    log_error "$container did not become healthy within ${max_wait}s"
    return 1
}

# Wait for a postgres container to accept connections
wait_postgres() {
    local container="$1"
    local max_wait="${2:-60}"
    local count=0

    log_info "Waiting for $container to accept connections..."
    while [ $count -lt $max_wait ]; do
        if podman exec "$container" pg_isready -q 2>/dev/null; then
            log_info "$container is ready"
            return 0
        fi
        sleep 2
        count=$((count + 2))
    done

    log_error "$container did not become ready within ${max_wait}s"
    return 1
}

# Wait for redis to respond to PING
wait_redis() {
    local container="$1"
    local max_wait="${2:-60}"
    local count=0

    log_info "Waiting for $container to respond to PING..."
    while [ $count -lt $max_wait ]; do
        if podman exec "$container" redis-cli ping 2>/dev/null | grep -q PONG; then
            log_info "$container is ready"
            return 0
        fi
        sleep 2
        count=$((count + 2))
    done

    log_error "$container did not become ready within ${max_wait}s"
    return 1
}

# Wait for a container's /health endpoint to report success (in-container wget).
# Used instead of wait_healthy because `podman run` here does not define a
# Docker-style HEALTHCHECK; the authoritative check is in-container `wget`.
wait_http_health() {
    local container="$1"
    local port="${2:-3000}"
    local max_wait="${3:-120}"
    local count=0

    log_info "Waiting for $container :$port/health..."
    while [ $count -lt $max_wait ]; do
        if podman exec "$container" wget -qO- "http://localhost:${port}/health" 2>/dev/null | grep -q '"success":true'; then
            log_info "$container is healthy"
            return 0
        fi
        sleep 2
        count=$((count + 2))
    done

    log_error "$container did not become healthy within ${max_wait}s"
    return 1
}

# Setup: Build images and start services
setup() {
    log_header "=== Setting up Las Flores 2077 ==="
    
    cd "$PROJECT_ROOT"
    
    # Create network if it doesn't exist
    podman network create las-flores-net 2>/dev/null || true
    
    # Create volumes if they don't exist
    podman volume create postgres-oltp-data 2>/dev/null || true
    podman volume create postgres-olap-data 2>/dev/null || true
    podman volume create redis-data 2>/dev/null || true
    podman volume create minio-data 2>/dev/null || true
    podman volume create neo4j-data 2>/dev/null || true
    
    # Start databases
    log_info "Starting PostgreSQL OLTP..."
    podman run -d --name las-flores-postgres-oltp \
        --network las-flores-net -p 5434:5432 \
        -v postgres-oltp-data:/var/lib/postgresql/data \
        -e POSTGRES_DB=las_flores \
        -e POSTGRES_USER=las_flores \
        -e POSTGRES_PASSWORD=las_flores_dev_password \
        docker.io/library/postgres:16-alpine 2>/dev/null || log_warn "Container already exists"
    
    log_info "Starting PostgreSQL OLAP..."
    podman run -d --name las-flores-postgres-olap \
        --network las-flores-net -p 5433:5432 \
        -v postgres-olap-data:/var/lib/postgresql/data \
        -e POSTGRES_DB=las_flores_analytics \
        -e POSTGRES_USER=las_flores_analytics \
        -e POSTGRES_PASSWORD=las_flores_analytics_dev_password \
        docker.io/library/postgres:16-alpine 2>/dev/null || log_warn "Container already exists"
    
    log_info "Starting Redis..."
    podman run -d --name las-flores-redis \
        --network las-flores-net -p 6379:6379 \
        -v redis-data:/data \
        docker.io/library/redis:7-alpine 2>/dev/null || log_warn "Container already exists"
    
    log_info "Starting MinIO..."
    podman run -d --name las-flores-minio \
        --network las-flores-net -p 9000:9000 -p 9001:9001 \
        -v minio-data:/data \
        docker.io/minio/minio:latest server /data --console-address ":9001" 2>/dev/null || log_warn "Container already exists"

    log_info "Starting Neo4j (graph authoring canvas, M27)..."
    podman run -d --name las-flores-neo4j \
        --network las-flores-net -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
        -v neo4j-data:/data \
        -e NEO4J_AUTH=neo4j/lasfloresdev123 \
        -e NEO4J_server_memory_heap_max__size=512M \
        -e NEO4J_server_memory_pagecache_size=256M \
        docker.io/library/neo4j:5-community 2>/dev/null || log_warn "Container already exists"
    
    # Wait for databases to be ready
    wait_postgres "las-flores-postgres-oltp" 30
    wait_postgres "las-flores-postgres-olap" 30
    wait_redis "las-flores-redis" 30
    
    # Get container IPs
    OLTP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-oltp)
    OLAP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-olap)
    REDIS_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-redis)
    MINIO_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-minio)
    NEO4J_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-neo4j)

    log_info "Container IPs:"
    log_info "  OLTP: $OLTP_IP"
    log_info "  OLAP: $OLAP_IP"
    log_info "  Redis: $REDIS_IP"
    log_info "  MinIO: $MINIO_IP"
    log_info "  Neo4j: $NEO4J_IP"
    
    # Build the single server image (runs BOTH server + intake-worker)
    log_info "Building server image..."
    podman build -f server/Dockerfile -t las-flores-server .

    # Start intake-worker FIRST (migration owner, port 3001). It is the ONLY
    # process that runs runAllMigrations() (SQL + content migration). The
    # game-server reads the tables it creates, so wait for it to be healthy.
    log_info "Starting intake-worker (migration owner)..."
    # A previous (stopped) intake-worker would make `podman run` fail with
    # "already exists" and then stall the health wait — remove it first so the
    # container is always created fresh on a re-run.
    if podman inspect las-flores-intake-worker &>/dev/null 2>&1; then
        log_warn "Existing intake-worker found — removing and recreating"
        podman rm -f las-flores-intake-worker
    fi
    podman run -d --name las-flores-intake-worker \
        --network las-flores-net -p 3001:3001 \
        --add-host="host.containers.internal:host-gateway" \
        -v "$PROJECT_ROOT/server/src:/app/server/src" \
        -v "$PROJECT_ROOT/shared:/app/shared" \
        -v "$PROJECT_ROOT/infra:/app/infra" \
        -v "$PROJECT_ROOT/content:/app/content" \
        -v "$PROJECT_ROOT/docs:/app/docs:ro" \
        -e NODE_ENV=development \
        -e PORT=3001 \
        -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
        -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
        -e REDIS_URL="redis://${REDIS_IP}:6379" \
        -e MINIO_ENDPOINT="${MINIO_IP}" \
        -e MINIO_PORT=9000 \
        -e MINIO_PUBLIC_URL="http://localhost:9000" \
        -e MINIO_ACCESS_KEY=minioadmin \
        -e MINIO_SECRET_KEY=minioadmin \
        -e NEO4J_URI="bolt://${NEO4J_IP}:7687" \
        -e NEO4J_USER=neo4j \
        -e NEO4J_PASSWORD=lasfloresdev123 \
        -e NEO4J_ENABLED=true \
        -e JWT_SECRET=dev-secret \
        -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
        -e LITELLM_API_KEY=local-key \
        -e LLM_MODEL=poolside/laguna-m.1 \
        -e LLM_PROVIDER=litellm \
        las-flores-server npm run dev:intake --workspace=server 2>/dev/null || log_warn "Container already exists"

    wait_http_health "las-flores-intake-worker" 3001 180 || { log_error "intake-worker did not become healthy"; exit 1; }

    # Wait for Neo4j to be ready - it can take a moment after intake-worker starts
    log_info "Waiting for Neo4j to be ready..."
    local neo4j_attempt=0
    local neo4j_max=60
    while [ $neo4j_attempt -lt $neo4j_max ]; do
        if podman exec las-flores-intake-worker wget -qO- http://localhost:3001/health 2>/dev/null | grep -q '"success":true'; then
            # Genuine Neo4j readiness probe: cypher-shell returns nonzero until the
            # graph accepts the connection and auth. No `|| true` bypass — the loop
            # only logs Neo4j healthy after this succeeds, so seed:graph never runs
            # against a still-initializing graph.
            if podman exec las-flores-neo4j cypher-shell \
                -a "bolt://${NEO4J_IP}:7687" -u neo4j -p lasfloresdev123 \
                "RETURN 1 AS ok" >/dev/null 2>&1; then
                log_info "Neo4j is healthy"
                break
            fi
        fi
        sleep 2
        neo4j_attempt=$((neo4j_attempt + 2))
    done
    if [ $neo4j_attempt -ge $neo4j_max ]; then
        log_warn "Neo4j did not become ready within ${neo4j_max}s, proceeding anyway"
    fi

    # Setup enables the graph (NEO4J_ENABLED=true), so seed the canonical `:Content`
    # base layer now that the intake-worker has migrated the content store. Without
    # this, graph-backed critique/impact/merged-view reads run against an empty canon.
    # Fail setup if seeding fails so developers don't proceed on a partial graph.
    log_info "Seeding Neo4j base graph (canonical :Content nodes)..."
    podman exec las-flores-intake-worker npm run seed:graph --workspace=server || {
        log_error "Failed to seed Neo4j base graph"
        exit 1
    }
    # Verify that the seed actually produced content nodes. The intake-worker
    # does not register /api/graph/nodes, so query Neo4j directly via
    # cypher-shell (returns nonzero on auth/connect failure).
    # Capture the cypher-shell exit code separately: the previous pipeline ended
    # in `head`, so a failed cypher-shell was masked (empty result → the
    # `[ "$count" -eq 0 ]` test errored and the warning was skipped). Now we
    # report explicitly when the count could not be verified.
    local seeded_raw
    seeded_raw=$(podman exec las-flores-neo4j cypher-shell \
        -a "bolt://${NEO4J_IP}:7687" -u neo4j -p lasfloresdev123 \
        "MATCH (n:Content) RETURN count(n) AS c" \
        2>/dev/null) || true
    local seed_rc=$?
    local seeded_count
    seeded_count=$(printf '%s' "$seeded_raw" | grep -oE '^[0-9]+' | head -n1)
    seeded_count="${seeded_count:-0}"
    if [ "$seed_rc" -ne 0 ]; then
        # cypher-shell itself failed (auth/connect) — we cannot trust the
        # count, so flag it instead of silently proceeding as if verified.
        log_warn "Could not verify Neo4j seed count (cypher-shell exit ${seed_rc}); graph may be partial — re-run seed if needed"
    fi
    if [ "$seeded_count" -eq 0 ] && [ "$seed_rc" -eq 0 ]; then
        log_error "Neo4j seed reported success but 0 content nodes found - proceeding may result in partial graph"
        # Note: we don't exit here to avoid blocking developers on transient issues;
        # the seeded count can be verified later via /api/graph/nodes
        log_warn "0 content nodes verified after Neo4j seed — re-run seed if needed"
    fi

    # Start the game-server (port 3000) — after intake-worker is healthy
    log_info "Starting game-server..."
    # Remove an existing game-server container so reruns use the freshly built image
    # and current configuration, rather than keeping a stale container alive.
    if podman inspect las-flores-server &>/dev/null 2>&1; then
        log_warn "Existing game-server found — removing and recreating"
        podman rm -f las-flores-server
    fi
    podman run -d --name las-flores-server \
        --network las-flores-net -p 3000:3000 \
        --add-host="host.containers.internal:host-gateway" \
        -v "$PROJECT_ROOT/server/src:/app/server/src" \
        -v "$PROJECT_ROOT/shared:/app/shared" \
        -v "$PROJECT_ROOT/infra:/app/infra" \
        -v "$PROJECT_ROOT/content:/app/content" \
        -v "$PROJECT_ROOT/docs:/app/docs:ro" \
        -e NODE_ENV=development \
        -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
        -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
        -e REDIS_URL="redis://${REDIS_IP}:6379" \
        -e MINIO_ENDPOINT="${MINIO_IP}" \
        -e MINIO_PORT=9000 \
        -e MINIO_PUBLIC_URL="http://localhost:9000" \
        -e MINIO_ACCESS_KEY=minioadmin \
        -e MINIO_SECRET_KEY=minioadmin \
        -e NEO4J_URI="bolt://${NEO4J_IP}:7687" \
        -e NEO4J_USER=neo4j \
        -e NEO4J_PASSWORD=lasfloresdev123 \
        -e NEO4J_ENABLED=true \
        -e JWT_SECRET=dev-secret \
        -e LITELLM_BASE_URL="http://host.containers.internal:4000" \
        -e LITELLM_API_KEY=local-key \
        -e LLM_MODEL=poolside/laguna-m.1 \
        -e LLM_PROVIDER=litellm \
        las-flores-server 2>/dev/null || log_warn "Container already exists"

    wait_http_health "las-flores-server" 3000 60

    # Get intake-worker IP for the admin panel (admin talks to intake-worker:3001)
    INTAKE_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-intake-worker)

    # Build admin image before starting the container so setup works on a
    # fresh environment (no cached image).
    log_info "Building admin image..."
    podman build -f admin/Dockerfile -t las-flores-admin . || {
        log_error "Failed to build admin image"
        exit 1
    }

    log_info "Starting admin panel (-> intake-worker:3001)..."
    if podman inspect las-flores-admin &>/dev/null 2>&1; then
        log_warn "Admin container already exists — recreating"
        podman rm -f las-flores-admin
    fi
    podman run -d --name las-flores-admin \
        --network las-flores-net -p 3002:3000 \
        --add-host="las-flores-intake-worker:$INTAKE_IP" \
        -v "$PROJECT_ROOT/admin/src:/app/admin/src" \
        -v "$PROJECT_ROOT/shared:/app/shared" \
        -w /app \
        -e NODE_ENV=development \
        -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
        -e INTERNAL_SERVER_URL=http://$INTAKE_IP:3001 \
        -e NEXT_PUBLIC_DEV_LOGIN_ENABLED=true \
        -e DEV_LOGIN_ENABLED=true \
        las-flores-admin || {
            log_error "Failed to start admin container"
            exit 1
        }

    # Verify SQL migrations (content migration already ran in the intake-worker)
    log_info "Verifying migrations..."
    "$SCRIPT_DIR/apply-migrations.sh" verify || { log_error "Migration verify failed — aborting setup"; exit 1; }

    log_header "=== Setup Complete ==="
    log_info "Intake-worker: http://localhost:3001 (migrations + admin/AI/content)"
    log_info "Server:        http://localhost:3000"
    log_info "Admin panel:    http://localhost:3002"
}

# Run linting
run_lint() {
    log_header "=== Running Lint ==="
    cd "$PROJECT_ROOT"
    
    podman run --rm \
        -v "$(pwd):/app" \
        -w /app \
        node:20 \
        npm run lint
    
    log_info "Lint passed!"
}

# Build all workspaces
run_build() {
    log_header "=== Building All Workspaces ==="
    cd "$PROJECT_ROOT"
    
    podman run --rm \
        -v "$(pwd):/app" \
        -w /app \
        node:20 \
        npm run build
    
    log_info "Build completed!"
}

# Run server tests
run_server_test() {
    log_header "=== Running Server Tests ==="
    cd "$PROJECT_ROOT"
    
    # Get container IPs
    OLTP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-oltp)
    OLAP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-olap)
    REDIS_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-redis)

    podman run --rm \
        --network las-flores-net \
        -v "$(pwd):/app" \
        -w /app \
        -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
        -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
        -e REDIS_URL="redis://${REDIS_IP}:6379" \
        -e NODE_ENV=test \
        node:20 \
        npm run test:server
    
    log_info "Server tests completed!"
}

# Run E2E tests
run_e2e() {
    log_header "=== Running E2E Tests ==="
    cd "$PROJECT_ROOT"
    
    # Check if server is running
    if ! podman inspect las-flores-server &> /dev/null; then
        log_error "Server is not running. Run './scripts/podman-workflow.sh setup' first."
        exit 1
    fi
    
    # Build E2E image
    log_info "Building E2E image..."
    podman build -f client/Dockerfile.e2e -t las-flores-e2e .
    
    # Run E2E tests
    #
    # API_URL must point at the Vite dev server (http://localhost:5173), NOT the
    # raw server container IP. The browser page lives on localhost:5173, and the
    # auth cookie is host-scoped: a cookie set against the server IP would never
    # be sent for localhost:5173 requests, leaving every test stuck on the login
    # screen. Routing API_URL through the proxy keeps cookie + page on the same host.
    log_info "Running E2E tests..."
    podman run --rm \
        --network las-flores-net \
        -v "$(pwd)/client:/app/client" \
        -v "$(pwd)/shared:/app/shared" \
        -v /app/client/node_modules \
        -e API_URL="http://localhost:5173" \
        -w /app/client \
        las-flores-e2e \
        npx playwright test --config playwright.docker.config.ts
    
    log_info "E2E tests completed!"
}

# Run all tests
run_all_tests() {
    log_header "=== Running All Tests ==="
    
    run_lint
    run_build
    run_server_test
    
    # Check if server is running for E2E
    if podman inspect las-flores-server &> /dev/null; then
        run_e2e
    else
        log_warn "Skipping E2E tests (server not running)"
    fi
    
    log_header "=== All Tests Complete ==="
}

# Clean up
cleanup() {
    log_header "=== Cleaning Up ==="
    cd "$PROJECT_ROOT"
    
    # Stop and remove containers
    podman rm -f las-flores-server las-flores-intake-worker las-flores-admin 2>/dev/null || true
    podman rm -f las-flores-postgres-oltp 2>/dev/null || true
    podman rm -f las-flores-postgres-olap 2>/dev/null || true
    podman rm -f las-flores-redis 2>/dev/null || true
    podman rm -f las-flores-minio 2>/dev/null || true
    podman rm -f las-flores-neo4j 2>/dev/null || true
    podman rm -f las-flores-playwright 2>/dev/null || true
    
    # Remove network
    podman network rm las-flores-net 2>/dev/null || true
    
    # Remove volumes
    podman volume rm postgres-oltp-data 2>/dev/null || true
    podman volume rm postgres-olap-data 2>/dev/null || true
    podman volume rm redis-data 2>/dev/null || true
    podman volume rm minio-data 2>/dev/null || true
    podman volume rm neo4j-data 2>/dev/null || true
    
    log_info "Cleanup complete!"
}

# Start admin panel only
start_admin() {
    log_header "=== Starting Admin Panel ==="
    
    # The admin panel talks to the intake-worker (port 3001), not the
    # game-server. Ensure the intake-worker is running.
    if [ "$(podman inspect -f '{{.State.Status}}' las-flores-intake-worker 2>/dev/null)" != "running" ]; then
        log_error "Intake-worker is not running. Run './scripts/podman-workflow.sh setup' first."
        exit 1
    fi

    # Build admin image if not present
    if ! podman image exists las-flores-admin &>/dev/null; then
        log_info "Building admin image..."
        podman build -f "$PROJECT_ROOT/admin/Dockerfile" -t las-flores-admin "$PROJECT_ROOT" || {
            log_error "Failed to build admin image"
            exit 1
        }
    fi
    
    # Get intake-worker IP for the admin panel (admin talks to intake-worker:3001)
    INTAKE_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-intake-worker)
    
    # Remove existing container if stopped so run succeeds
    if podman inspect las-flores-admin &>/dev/null 2>&1; then
        local admin_status=$(podman inspect -f '{{.State.Status}}' las-flores-admin 2>/dev/null)
        if [ "$admin_status" = "running" ]; then
            log_info "Admin container already running"
            log_info "Admin panel at http://localhost:3002"
            return 0
        fi
        log_warn "Removing stopped admin container"
        podman rm -f las-flores-admin
    fi

    podman run -d --name las-flores-admin \
        --network las-flores-net -p 3002:3000 \
        --add-host="las-flores-intake-worker:$INTAKE_IP" \
        -v "$PROJECT_ROOT/admin/src:/app/admin/src" \
        -v "$PROJECT_ROOT/shared:/app/shared" \
        -w /app \
        -e NODE_ENV=development \
        -e NEXT_PUBLIC_SERVER_URL=http://localhost:3001 \
        -e INTERNAL_SERVER_URL=http://$INTAKE_IP:3001 \
        -e NEXT_PUBLIC_DEV_LOGIN_ENABLED=true \
        -e DEV_LOGIN_ENABLED=true \
        las-flores-admin || {
            log_error "Failed to start admin container — check image, port (3002), and network (las-flores-net)"
            exit 1
        }
    
    log_info "Admin panel starting at http://localhost:3002"
}

# Show status
show_status() {
    log_header "=== Service Status ==="
    
    echo ""
    echo "Containers:"
    podman ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "las-flores|NAMES" || echo "No containers found"
    
    echo ""
    echo "Volumes:"
    podman volume ls | grep -E "las-flores|postgres|redis|minio|VOLUME" || echo "No volumes found"
    
    echo ""
    echo "Network:"
    podman network ls | grep -E "las-flores|NAME" || echo "No network found"
}

# Main
case "${1:-help}" in
    setup)
        setup
        ;;
    admin)
        start_admin
        ;;
    test)
        run_all_tests
        ;;
    lint)
        run_lint
        ;;
    build)
        run_build
        ;;
    server-test)
        run_server_test
        ;;
    e2e)
        run_e2e
        ;;
    clean)
        cleanup
        ;;
    status)
        show_status
        ;;
    help|*)
        echo "Usage: $0 {setup|admin|test|lint|build|server-test|e2e|clean|status}"
        echo ""
        echo "Commands:"
        echo "  setup       - Initial setup (build images, start services, apply migrations)"
        echo "  admin       - Start admin panel only (requires server running)"
        echo "  test        - Run all tests (lint, build, server tests, e2e)"
        echo "  lint        - Run linting only"
        echo "  build       - Build all workspaces"
        echo "  server-test - Run server tests only"
        echo "  e2e         - Run E2E tests (requires server running)"
        echo "  clean       - Clean up containers and volumes"
        echo "  status      - Show status of all services"
        ;;
esac
