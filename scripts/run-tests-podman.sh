#!/bin/bash
#
# run-tests-podman.sh - Run tests in a Podman container
#
# Usage:
#   ./run-tests-podman.sh <test-path> [--env <env-file>] [--help]
#
# Examples:
#   ./run-tests-podman.sh server/tests/integration/assets.test.ts
#   ./run-tests-podman.sh server/tests/ --env .env.test
#   ./run-tests-podman.sh --help
#
set -e

# Configuration
DEFAULT_ENV_FILE=".env"
CONTAINER_WORKDIR="/app"
SERVER_DIR="server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $(basename "$0") <test-path> [OPTIONS]

Run tests in a Podman container with proper environment configuration.

Arguments:
    test-path          Path to test file or directory (relative to project root)

Options:
    --env, -e FILE     Environment file to load (default: .env)
    --help, -h         Show this help message
    --verbose, -v      Show verbose output

Examples:
    $(basename "$0") server/tests/integration/assets.test.ts
    $(basename "$0") server/tests/integration/
    $(basename "$0") server/tests/ --env .env.test

Prerequisites:
    - Podman installed and running
    - Backing services running (PostgreSQL, Redis, MinIO)
    - Environment file with DATABASE_URL, etc.
EOF
    exit 0
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
TEST_PATH=""
ENV_FILE="$DEFAULT_ENV_FILE"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            usage
            ;;
        --env|-e)
            ENV_FILE="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        -*)
            log_error "Unknown option: $1"
            exit 1
            ;;
        *)
            TEST_PATH="$1"
            shift
            ;;
    esac
done

# Validate arguments
if [[ -z "$TEST_PATH" ]]; then
    log_error "Test path is required"
    echo "Run with --help for usage information"
    exit 1
fi

# Resolve paths relative to project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FULL_TEST_PATH="$PROJECT_ROOT/$TEST_PATH"

if [[ ! -e "$FULL_TEST_PATH" ]]; then
    log_error "Test path not found: $TEST_PATH"
    exit 1
fi

log_info "Project root: $PROJECT_ROOT"
log_info "Test path: $TEST_PATH"
log_info "Environment file: $ENV_FILE"

# Load environment file if it exists
if [[ -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
    log_info "Loading environment from $ENV_FILE"
    set -a
    source "$PROJECT_ROOT/$ENV_FILE"
    set +a
else
    log_warn "Environment file not found: $ENV_FILE"
    log_warn "Using existing environment variables"
fi

# Verify required environment variables
REQUIRED_VARS=("DATABASE_URL" "REDIS_URL")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    log_error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

# Build common environment variables for the container as an array
ENV_VARS=()
ENV_VARS+=("-e" "DATABASE_URL=$DATABASE_URL")
ENV_VARS+=("-e" "REDIS_URL=$REDIS_URL")
ENV_VARS+=("-e" "NODE_ENV=test")

if [[ -n "$ANALYTICS_DATABASE_URL" ]]; then
    ENV_VARS+=("-e" "ANALYTICS_DATABASE_URL=$ANALYTICS_DATABASE_URL")
fi

if [[ -n "$JWT_SECRET" ]]; then
    ENV_VARS+=("-e" "JWT_SECRET=$JWT_SECRET")
fi

if [[ -n "$MINIO_ENDPOINT" ]]; then
    ENV_VARS+=("-e" "MINIO_ENDPOINT=$MINIO_ENDPOINT")
    ENV_VARS+=("-e" "MINIO_PORT=$MINIO_PORT")
    ENV_VARS+=("-e" "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY")
    ENV_VARS+=("-e" "MINIO_SECRET_KEY=$MINIO_SECRET_KEY")
fi

# Build the test command
# The container workdir is /app, and SERVER_DIR is "server", so TEST_PATH should be relative to /app
TEST_COMMAND="cd ${SERVER_DIR} && npm test -- ${TEST_PATH}"

if [[ "$VERBOSE" == "true" ]]; then
    TEST_COMMAND="$TEST_COMMAND --verbose"
fi

log_info "Running tests..."
log_info "Command: $TEST_COMMAND"

# Run the test container
podman run --rm \
    --network host \
    -v "$PROJECT_ROOT:/${CONTAINER_WORKDIR}:ro" \
    -w "${CONTAINER_WORKDIR}" \
    "${ENV_VARS[@]}" \
    node:20-alpine \
    sh -c "$TEST_COMMAND"

exit_code=$?

if [[ $exit_code -eq 0 ]]; then
    log_info "Tests passed!"
else
    log_error "Tests failed with exit code: $exit_code"
fi

exit $exit_code