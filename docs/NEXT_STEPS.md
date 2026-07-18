# Next Steps

> Open **action items** and **gaps** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Last updated: 2026-07-18

---

## Open work

### Intake integrity

- **DB rollback on verify-after-migrate failure** — `migrateStagedPlan()` writes rows to Postgres before `verifyStagedPlan()` runs. If verification fails after the write, there is no automatic rollback. Decide + implement: capture written row PKs during migrate and delete them on verify failure, or re-run migrate after the author fixes the content.

### Analytics completeness (M17 follow-up)

- **LLM token/cost tracking per plan** — `admin_events.event_data` is emitted for plan lifecycle events (`plan_created`, `plan_staged`, `plan_verified`, `plan_failed`) and user/settings events, but `LLMService.ts`/`LiteLLMProvider.ts` do not expose usage/token/cost fields today. Capture Provider-returned token counts and estimated cost into `event_data` so the analytics dashboard can surface LLM spend per plan.
- **`admin_events` retention/TTL** — `053_admin_events.sql` creates the table with no retention policy. Decide + implement: a TTL (`created_at`-based purge), an `ON DELETE CASCADE` from `content_plans` for plan-scoped events, or an explicit archiving + deletion cron. If indefinite retention is required (for audit), document that decision here and in the migration.

### Mission reporting (M15 follow-up)

- **Mission completion/admin stats view** — `mission_reward_claims` is written atomically when a player claims a mission reward (`dialogue-helpers.ts:189`, `IronGateValidator.ts:253`), but no admin aggregation surface exists. Add a query + UI widget showing completion rate, claim counts, and unique users per mission, on `/missions` or `/analytics`.

### Future extensions (aspirational, not planned)

- Tiered asset needs (major/standard/minor character).
- Collaborative editing.
- Clone-and-link mode (e.g., clone a character and auto-link dialogue to the original character's ID).
- External queue (BullMQ/streams) / SSE / horizontal scaling beyond single server — requires AGENTS.md constraint lift on new infra.

---

## Out of scope for current roadmap

- `/users` and `/settings` admin pages remain as stubs. Intentionally deferred to a future user-management milestone.

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` — shipped implementation, remaining open work (§4.4)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths
