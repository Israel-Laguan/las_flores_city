# Stress Testing Guide (Task 5.4)

## Prerequisites

### Install k6
```bash
# macOS
brew install k6

# Linux (deb)
sudo apt-get install k6

# Or use Docker:
# docker run --rm -i grafana/k6 run -
```

### Ensure Docker Stack is Running
```bash
docker compose up -d
# Verify all services healthy:
curl http://localhost:3000/health
```

## Load Test User Seeder

The seed script creates 500 test users with predictable credentials for K6 authentication.

### Seed Users
```bash
cd server
npm run seed:load-users
```

### Cleanup Users
```bash
npm run seed:load-users -- --cleanup
```

## Running the Load Test

```bash
# Using local k6 installation
BASE_URL=http://localhost:3000 npm run test:load

# Or using Docker (host.docker.internal resolves to host from container)
docker run --rm -i -v $(pwd)/tests/load:/scripts grafana/k6 run -e BASE_URL=http://host.docker.internal:3000 /scripts/breakthrough_rush.js
```

### Custom Base URL
```bash
BASE_URL=http://your-staging-url:3000 npm run test:load
```

## Load Test Configuration

The test (`breakthrough_rush.js`) simulates:

| Phase | Duration | VUs | Purpose |
|-------|----------|-----|---------|
| Ramp-up | 30s | 0→500 | Gradual load increase |
| Sustain | 1m | 500 | Heavy concurrent load |
| Scale-down | 30s | 500→0 | Graceful termination |

### Thresholds
- `custom_req_duration` p(95) < 500ms — 95% of requests must complete under 500ms (adjusted for local dev overhead)
- `custom_error_rate` rate < 0.01 — Less than 1% error rate

**Note:** The spec target is 150ms P95 for production. Local Docker development typically
runs 200-300ms slower due to container networking and file system overhead.

## What the Test Validates

1. **Authentication throughput** — 500 concurrent logins via `/auth/login`
2. **Cache-heavy reads** — `/player/state` fetches from Redis
3. **Dialogue resolution under load** — `/dialogue/start` triggers tree resolution via `DialogueResolver`
4. **OLTP write + telemetry** — `/dialogue/choose` writes state and fire-and-forgets OLAP

## Monitoring During Tests

```bash
# Server logs (in another terminal)
docker compose logs -f server

# Redis connection count
docker compose exec redis redis-cli info clients

# PostgreSQL connections (OLTP)
docker compose exec postgres-oltp psql -U las_flores -d las_flores -c "SELECT count(*) FROM pg_stat_activity;"
```

## Troubleshooting

### Connection Refused / ECONNREFUSED
- Ensure `docker compose up -d` completed successfully
- Check `curl http://localhost:3000/health` returns `{"success":true}`

### Authentication Failures (401)
- Seed users first: `npm run seed:load-users`
- Verify password matches `TEST_PASSWORD` in the script (`password123`)

### Redis Blocking
If Redis blocks during cache invalidation, check:
- `invalidatePattern` uses SCAN + UNLINK (non-blocking)
- Monitor Redis latency during leaderboard finalization

### Connection Pool Exhaustion
If PostgreSQL errors on "too many connections":
- Verify `oltpPool.max` is 50 in `connection.ts`
- Consider reducing VU count or adding PgBouncer

### High Latency (>150ms P95)
- Check if Redis cache is populated (run `npm run migrate` if needed)
- Monitor OLAP telemetry background load
- Consider reducing time_blocks spent per user