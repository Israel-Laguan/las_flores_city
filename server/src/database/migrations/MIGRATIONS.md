# Database Schema Migrations

This directory contains SQL migration files for the Las Flores 2077 databases.

## Migration Structure

- **OLTP Database** (`postgres-oltp:5434` / `las_flores`) - Main game state
- **OLAP Database** (`postgres-olap:5433` / `las_flores_analytics`) - Analytics & leaderboards

## Migration Targets

Each migration file has a target database indicated by its content:

### OLTP Migrations (23 migrations)
Apply to: `postgres-oltp` container, `las_flores` database

| Version | Migration | Description |
|---------|-----------|-------------|
| 000 | schema_migrations.sql | Tracking table (both DBs) |
| 001 | initial_schema.sql | Core tables: users, characters, scenes, etc. |
| 003 | player_state_schema.sql | Player state table |
| 004 | scene_payload.sql | Scene enhancements |
| 005 | dialogue_service.sql | Dialogue trees and overlays |
| 006 | add_move_event_type.sql | Event type: move |
| 007 | sleep_reset_schema.sql | Sleep/time block system |
| 008 | add_sleep_event_type.sql | Event type: sleep |
| 009 | add_user_relationships.sql | NPC relationships |
| 010 | metadata_readiness.sql | Metadata tracking |
| 011 | bank_constraints.sql | Bank transaction constraints |
| 012 | gigs_schema.sql | Gig/minigame system |
| 013 | add_gig_event_type.sql | Event type: gig_completed |
| 014 | social_feed.sql | Social posts table |
| 015 | player_sms_threads_v2.sql | SMS thread system |
| 016 | add_sms_event_types.sql | SMS event types |
| 017 | mystery_state.sql | Mystery tracking |
| 018 | vault_system.sql | Vault items and player vault |
| 021 | leaderboards.sql | Leaderboard tables |
| 022 | ai_settings.sql | AI API key storage |
| 023 | patreon_entitlements.sql | Patreon OAuth integration |
| 024 | marketplace.sql | Shop items, inventory, cosmetics |
| 026 | vault_signed_urls.sql | Vault media signed URL support |
| 036 | add_location_content_type.sql | Add 'location' to migration_log.content_type CHECK |

### OLAP Migrations (5 migrations)
Apply to: `postgres-olap` container, `las_flores_analytics` database

| Version | Migration | Description |
|---------|-----------|-------------|
| 000 | schema_migrations.sql | Tracking table (both DBs) |
| 002 | analytics_schema.sql | Base OLAP tables: player_events, sessions, mystery_progress |
| 019 | add_vault_event_type.sql | Event type: vault_item_unlocked |
| 020 | add_mystery_solved_event_type.sql | Event type: mystery_solved |
| 025 | marketplace_olap.sql | Event types: iap_completed, shop_purchase |

## Usage

### Apply migrations to Docker databases

```bash
# Apply all migrations to both databases
./scripts/apply-migrations.sh both

# Apply to OLTP only
./scripts/apply-migrations.sh oltp

# Apply to OLAP only
./scripts/apply-migrations.sh olap

# Check status
./scripts/apply-migrations.sh status
```

### Manual application

```bash
# OLTP
cat server/src/database/migrations/027_new_feature.sql | docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores

# OLAP
cat server/src/database/migrations/028_new_analytics.sql | docker exec -i las-flores-postgres-olap psql -U las_flores_analytics -d las_flores_analytics
```

## Tracking

The `schema_migrations` table tracks which migrations have been applied to each database:

```sql
-- OLTP
SELECT version, filename, applied_at FROM schema_migrations ORDER BY version;

-- OLAP
SELECT version, filename, applied_at FROM schema_migrations ORDER BY version;
```
