---
status: planned
goal: Add admin-side analytics for Story Builder usage via `queryOLAP` (separate from player telemetry)
background:
  - No analytics emitted for Story Builder today: `server/src/routes/admin-story-builder*.ts` only do CRUD/plan/execute – no `queryOLAP` or event logging
  - OLAP infrastructure exists: `player_events` table pattern, `queryOLAP` helper, `analyticsQueries.ts` for aggregations
  - `admin/src/app/analytics/page.tsx` exists with StatCards, DialogueRatesTable, StoryBeatReachTable, MysteryStatusTable – UI surface for admin analytics
  - `AGENTS.md` mandates `queryOLAP` for OLAP events (not `player_events` for admin; need separate `admin_events`)
  - `/users` and `/settings` UI pages exist as stubs (placeholder content only); no backend API endpoints
scope:
  in:
    - New `admin_events` OLAP table (PostgreSQL) for Story Builder telemetry
    - Event emission points: plan created, plan refined, plan staged, plan migrated, plan verified, plan failed
    - Metrics: items per plan, LLM tokens used (via provider usage data), time-to-completion
    - Analytics dashboard widget on Plans page and/or `/analytics` page
    - Backend endpoints for user management: list users, view user detail, update roles/status
    - Backend endpoints for admin settings: read/write system preferences
    - UI wire-up: fetch dynamic data instead of placeholder lists
  out:
    - Async execution (moved to M18-big-requirement-throughput)
approach:
  - New migration `049_admin_events.sql`: `id` (uuid), `event_type`, `event_data` (jsonb), `created_at`, `plan_id` (optional fk to content_plans)
  - Inject event emission in `ContentPlanService.parseDescription()` (plan created), `refinePlan()` (refined), `StoryBuilderOrchestrator` (staged/migrated/verified/failed)
  - Add `getAdminAnalytics()` in `analyticsQueries.ts` aggregating by event_type, items_per_plan
  - Add widget on `/plans` page: total plans created (24h/7d), avg items/plan, success rate
  - Add `server/src/routes/admin-users.ts` router with `GET /users`, `GET /users/:id`, `PATCH /users/:id` endpoints
  - Add `server/src/routes/admin-settings.ts` router with `GET /settings`, `PATCH /settings` endpoints
  - Wire up `admin/src/app/users/page.tsx` and `admin/src/app/settings/page.tsx` to call the new endpoints
verification:
  - Unit: queryOLAP wrapper emits correct JSON shape
  - Integration: POST /admin/story-builder/plan, then queryOLAP `admin_events`, assert event exists
  - Manual: /analytics page shows Story Builder metrics
dependencies:
  - M07 `queryOLAP` must be stable
  - `analyticsQueries.ts` must accept new event types
open-sub-questions:
  - Should admin_events reuse `player_events` schema (different event_type values) or be a separate table? (recommendation: separate table for cleaner queries/security, per AGENTS.md note)
  - What TTL/retention for admin events? (recommendation: same as player_events, or indefinite for audit purposes – TBD by ops)
  - Should we track LLM cost per plan? (recommendation: store tokens from provider usage if available, compute cost in dashboard)