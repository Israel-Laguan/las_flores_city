# Next Steps

> Open **action items** and **gaps** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Last updated: 2026-07-19

---

## Open work

### Analytics completeness (M17 follow-up)

- **LLM token/cost tracking per plan** — `admin_events.event_data` is emitted for plan lifecycle events (`plan_created`, `plan_staged`, `plan_verified`, `plan_failed`) and user/settings events, but `LLMService.ts`/`LiteLLMProvider.ts` do not expose usage/token/cost fields today. Capture Provider-returned token counts and estimated cost into `event_data` so the analytics dashboard can surface LLM spend per plan.

### Mission reporting (M15 follow-up)

- **Mission completion/admin stats view** — `mission_reward_claims` is written atomically when a player claims a mission reward (`dialogue-helpers.ts:189`, `IronGateValidator.ts:253`), but no admin aggregation query or UI widget exists. Add a query + UI widget showing completion rate, claim counts, and unique users per mission, on `/missions` or `/analytics`.

### Future extensions (aspirational, not planned)

- Tiered asset needs (major/standard/minor character).
- Collaborative editing.
- Clone-and-link mode (e.g., clone a character and auto-link dialogue to the original character's ID).
- External queue (BullMQ/streams) / SSE / horizontal scaling beyond single server — requires AGENTS.md constraint lift on new infra.

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` — shipped implementation, remaining open work (§4.4)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths

---

## Decisions

### Intake integrity — verify-after-migrate failure

**2026-07-19** — No destructive rollback. Migration is an idempotent upsert from on-disk YAML/MD files (the source of truth). If verification fails after migration, rows persist in the DB but are overwritten on re-migrate. Recovery: fix the content files on disk → re-migrate (`POST /plans/:id/migrate`, status relaxed to accept `failed`) → re-verify. The status guard on `migrateStagedPlan()` now accepts `failed` to support this flow.

### LLM token/cost tracking

**2026-07-19** — Best-effort capture. The `LLMProvider` interface gained an optional `getLastUsage?()` method; `LiteLLMProvider` captures `data.usage` from the OpenAI-compatible API response and stashes it. Route handlers read it after `parseDescription` and `refinePlan` and include token counts and estimated cost in `plan_created` / `plan_refined` `admin_events`. Fire-and-forget lore/fill calls are excluded (best effort). The analytics page displays `totalTokens7d` and `estimatedCost7d`.

### `admin_events` retention

**2026-07-19** — Indefinite retention for now. The table lives in OLTP (despite its analytics scope) and is low-volume (plan lifecycle + user/settings events only). Future work: migrate analytics tables (`admin_events`, `player_events`) to OLAP with date-based partitioning and regularly-refreshed materialized views so old data does not slow queries.
