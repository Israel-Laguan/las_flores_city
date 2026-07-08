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
    
    # Wait for databases to be ready
    wait_postgres "las-flores-postgres-oltp" 30
    wait_postgres "las-flores-postgres-olap" 30
    wait_redis "las-flores-redis" 30
    
    # Get container IPs
    OLTP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-oltp)
    OLAP_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-postgres-olap)
    REDIS_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-redis)
    MINIO_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-minio)
    
    log_info "Container IPs:"
    log_info "  OLTP: $OLTP_IP"
    log_info "  OLAP: $OLAP_IP"
    log_info "  Redis: $REDIS_IP"
    log_info "  MinIO: $MINIO_IP"
    
    # Apply migrations
    log_info "Applying migrations..."
    "$SCRIPT_DIR/apply-migrations.sh" both
    
    # Build and start server
    log_info "Building server..."
    podman build -f server/Dockerfile -t las-flores-server .
    
    log_info "Starting server..."
    podman run -d --name las-flores-server \
        --network las-flores-net -p 3000:3000 \
        -v "$PROJECT_ROOT/server/src:/app/server/src" \
        -v "$PROJECT_ROOT/shared:/app/shared" \
        -v "$PROJECT_ROOT/content:/app/content" \
        -v "$PROJECT_ROOT/docs:/app/docs:ro" \
        -e DATABASE_URL="postgresql://las_flores:las_flores_dev_password@${OLTP_IP}:5432/las_flores" \
        -e ANALYTICS_DATABASE_URL="postgresql://las_flores_analytics:las_flores_analytics_dev_password@${OLAP_IP}:5432/las_flores_analytics" \
        -e REDIS_URL="redis://${REDIS_IP}:6379" \
        -e MINIO_ENDPOINT="${MINIO_IP}" \
        -e MINIO_PORT=9000 \
        -e MINIO_ACCESS_KEY=minioadmin \
        -e MINIO_SECRET_KEY=minioadmin \
        -e JWT_SECRET=your-jwt-secret-change-in-production \
        las-flores-server 2>/dev/null || log_warn "Container already exists"
    
    wait_healthy "las-flores-server" 60
    
    log_header "=== Setup Complete ==="
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
    
    # Get server IP
    SERVER_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-server)
    
    # Run E2E tests
    log_info "Running E2E tests..."
    podman run --rm \
        --network las-flores-net \
        -v "$(pwd)/client:/app/client" \
        -v "$(pwd)/shared:/app/shared" \
        -v /app/client/node_modules \
        -e API_URL="http://${SERVER_IP}:3000" \
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
    podman rm -f las-flores-server 2>/dev/null || true
    podman rm -f las-flores-postgres-oltp 2>/dev/null || true
    podman rm -f las-flores-postgres-olap 2>/dev/null || true
    podman rm -f las-flores-redis 2>/dev/null || true
    podman rm -f las-flores-minio 2>/dev/null || true
    podman rm -f las-flores-playwright 2>/dev/null || true
    
    # Remove network
    podman network rm las-flores-net 2>/dev/null || true
    
    # Remove volumes
    podman volume rm postgres-oltp-data 2>/dev/null || true
    podman volume rm postgres-olap-data 2>/dev/null || true
    podman volume rm redis-data 2>/dev/null || true
    podman volume rm minio-data 2>/dev/null || true
    
    log_info "Cleanup complete!"
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
        echo "Usage: $0 {setup|test|lint|build|server-test|e2e|clean|status}"
        echo ""
        echo "Commands:"
        echo "  setup       - Initial setup (build images, start services, apply migrations)"
        echo "  test        - Run all tests (lint, build, server tests, e2e)"
        echo "  lint        - Run linting only"
        echo "  build       - Build all workspaces"
        echo "  server-test - Run server tests only"
        echo "  e2e         - Run E2E tests (requires server running)"
        echo "  clean       - Clean up containers and volumes"
        echo "  status      - Show status of all services"
        ;;
esac
