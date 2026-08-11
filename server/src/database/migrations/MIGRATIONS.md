# Database Schema Migrations

This directory contains SQL migration files for the Las Flores 2077 databases.

## Migration Structure

- **OLTP Database** (`postgres-oltp:5434` / `las_flores`) - Main game state
- **OLAP Database** (`postgres-olap:5433` / `las_flores_analytics`) - Analytics & leaderboards

## Migration Targets

Each migration file has a target database indicated by its content:

### OLTP Migrations (56 migrations)
Apply to: `postgres-oltp` container, `las_flores` database

| Version | Migration | Description |
|---------|-----------|-------------|
| 000 | schema_migrations.sql | Tracking table (both DBs) |
| 001 | initial_schema.sql | Core tables: users, characters, scenes, etc. |
| 003 | player_state_schema.sql | Player state table |
| 004 | scene_payload.sql | Scene enhancements |
| 005 | dialogue_service.sql | Dialogue trees and overlays |
| 007 | sleep_reset_schema.sql | Sleep/time block system |
| 009 | add_user_relationships.sql | NPC relationships |
| 010 | metadata_readiness.sql | Metadata tracking |
| 011 | bank_constraints.sql | Bank transaction constraints |
| 012 | gigs_schema.sql | Gig/minigame system |
| 014 | social_feed.sql | Social posts table |
| 015 | player_sms_threads_v2.sql | SMS thread system |
| 017 | mystery_state.sql | Mystery tracking |
| 018 | vault_system.sql | Vault items and player vault |
| 021 | leaderboards.sql | Leaderboard tables |
| 022 | ai_settings.sql | AI API key storage |
| 023 | patreon_entitlements.sql | Patreon OAuth integration |
| 024 | marketplace.sql | Shop items, inventory, cosmetics |
| 026 | vault_signed_urls.sql | Vault media signed URL support |
| 027 | aftermath.sql | Mystery aftermath system |
| 028 | metaplot_alignment.sql | Metaplot alignment tracking |
| 029 | player_state_decoupling.sql | Player state decoupling |
| 030 | dialogue_chunks.sql | Dialogue chunk storage |
| 031 | allow_player_state_credit_overdraft.sql | Credit overdraft support |
| 032 | dialogue_chunk_tracking.sql | Dialogue chunk tracking |
| 033 | district_travel_costs.sql | District travel costs |
| 034 | seed_districts.sql | Seed district data |
| 035 | seed_districts_extended.sql | Extended district seed data |
| 036 | add_location_content_type.sql | Add 'location' to migration_log.content_type CHECK |
| 037 | map_tiles.sql | Map tile system |
| 038 | character_portrait_urls.sql | Character portrait URLs |
| 039 | character_atlas_url.sql | Character atlas URL |
| 040 | asset_generation.sql | Asset generation tables |
| 041 | asset_generation_enhancements.sql | Asset generation enhancements |
| 042 | asset_unique_constraints.sql | Asset unique constraints |
| 043 | user_roles.sql | User roles |
| 044 | story_beats.sql | Story beats |
| 045 | migration_log_text_id.sql | Migration log text ID |
| 046 | stories.sql | Stories table |
| 047 | content_plans.sql | Content plans |
| 048 | content_plans_versioning.sql | Content plans versioning |
| 049 | content_plans_verified.sql | Content plans verified status |
| 050 | content_plans_verification.sql | Content plans verification |
| 051 | scene_location_asset_cascade.sql | Scene location asset cascade |
| 052 | mission_reward_claims.sql | Mission reward claims |
| 053 | admin_events.sql | Admin events |
| 054 | admin_settings.sql | Admin settings |
| 055 | content_plans_async.sql | Async content plans |
| 056 | player_state_and_stats.sql | Player state and stats |
| 057 | dialogue_ownership.sql | Dialogue ownership |
| 058 | drop_stories_table.sql | Drop stories table |
| 060 | admin_events_solidified.sql | Admin events solidified |
| 061 | admin_events_validate.sql | Admin events validation |
| 062 | job_runs.sql | Durable/resumable/idempotent job tracking for intake-worker (M22) |

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
