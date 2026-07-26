# Story Builder Intake Review — UX & Big-Story Plan Quality

> Review of the content intake experience (Story Builder wizard) and the AI plan-generation pipeline, with prioritized next steps.
>
> **Created**: 2026-07-25 · **Status**: review captured; implementation deferred pending scope approval

---

## 1. Scope & method

Reviewed the end-to-end intake path:

- **UI**: `admin/src/app/story-builder/` (DescribeStep, ReviewStep, hooks, polling logic)
- **Server**: `server/src/routes/admin-story-builder-generate.ts`, `server/src/services/ContentPlanService.ts`, `PlanGenerationJob.ts`, `LiteLLMProvider.ts`, `LLMPrompts.ts`, `ContentFillService.ts`
- **Harness**: `server/scripts/latency_probe.ts`
- **Docs**: `docs/DATA_INTAKE.md`, `docs/STORY_BUILDER_DESIGN.md`, `docs/STORY_BUILDER_OPERATIONS.md`, `.agents/skills/story-processing/SKILL.md`, `.kilo/plans/` (M13 unified intake, story-bible ingestion fix, async-fill split)

## 2. Current state (what works)

- Pipeline: outline → validate/repair → conflict check → scaffold → background fill (`PLAN_FILL_CONCURRENCY=3`, `PLAN_FILL_TIMEOUT_MS=120s`) → client poll → review → approve-and-solidify.
- Deterministic fallback outline when the LLM returns zero items (`ContentPlanService.generateFallbackPlan`), with `_meta.outline_source` / `_meta.outline_repaired` provenance.
- `FILL_TARGETS` (`ContentFillService.ts:6-31`) now covers full character metadata — the operations doc §4.2 note is stale on this point.
- End-to-end probe verified 2026-07-21 (12 items, fill 12/12 done) — see `STORY_BUILDER_OPERATIONS.md` §2.

---

## 3. Gap analysis — big-story robustness

### 3.1 The big story never reaches the LLM in full

`server/scripts/latency_probe.ts:29` truncates input to the first ~1,200 characters (`body.slice(0, 1200)`). The 18KB story-bible run used ~7% of the input; everything beyond is silently discarded. Big-story ingestion has never been genuinely exercised end-to-end.

### 3.2 No input-size handling

- **Client**: `admin/src/app/story-builder/components/DescribeStep.tsx:131` — no `maxLength`, no character counter, no guidance on expected input size.
- **Server**: `server/src/index.ts:108` — bare `express.json()` (default 100kb body limit); large pastes fail with a raw 413.
- **LLM call**: the full description is sent as a single user message (`LiteLLMProvider.callLLM`); there is no chunking, summarization, or entity-extraction pass.

### 3.3 Single-pass extraction does not scale

One LLM call must convert the whole story into one JSON plan. Failure modes for big inputs: model context overflow (non-retryable 400), truncated output (no `max_tokens` is set and `finish_reason` is never checked → "invalid JSON" → retries → 500), and poor entity recall for entities mentioned late in a long text.

### 3.4 Timeout budget is near its edge

The probe's plan creation took 55.7s against the 60s base timeout (`LLM_TIMEOUT_MS`), saved only by retry escalation (`LLM_MAX_TIMEOUT_MS=300s`). Larger inputs make first-attempt timeouts routine.

### 3.5 Silent quality degradation

When the outline fails or returns zero items, `generateFallbackPlan()` (`ContentPlanService.ts:167`) builds a lossy keyword plan (1 character + 1 scene) — but `outline_source: 'fallback'` is never surfaced in the UI. The user sees a suspiciously thin plan with no explanation.

### 3.6 Fill progress is invisible

The client polls `generation-status` every 1.5s (`useStoryPlanApiHandlers.ts:67-85`) but only refreshes the plan silently; the returned `progress { total, completed, failed }` and per-item statuses are never rendered. For a big-story fill the user stares at a static Review step full of `TODO:` fields.

### 3.7 Open correctness bug (operations doc §4.1)

`LoreGenerator.ts:30,98` and `PromptFileGenerator.ts:33,105` resolve `content/` via `process.cwd()` instead of `resolveContentDir()`; depending on launch directory, lore/prompt files for filled items can land in `server/content/`. Undermines completeness for multi-item runs.

### 3.8 Story-quality guardrails missing from the prompt

The story-processing skill's "Biography Check" (lore = past, beats = player's present) and player-agency branches (engage / reject / exploit) are not part of `buildOutlinePrompt`; big narrative inputs trend toward linear biographies instead of playable beats.

### 3.9 Doc drift

`docs/NEXT_STEPS.md` is referenced as the open-items source of truth by `game_design.md:100,302`, `DATA_INTAKE.md:212`, and `STORY_BUILDER_DESIGN.md:15,1030,1096,1230` — but the file no longer exists (partially extracted into `STORY_BUILDER_OPERATIONS.md`). `docs/milestones/` referenced by older plans is also absent.

---

## 4. Proposed next steps

### Phase 1 — Intake UX quick wins

1. **DescribeStep affordances**: character counter, soft length guidance, "what makes a good brief" examples (small request vs. story-bible scale), and a friendly client-side cap with clear messaging.
2. **Server body limit**: explicit JSON body limit for the story-builder route plus a graceful, human-readable 413/400 error instead of a raw parser failure.
3. **Surface pipeline state**: fallback warning banner when `outline_source === 'fallback'`; fill progress bar + per-item status chips on the Review step, rendered from the existing `generation-status` payload.

### Phase 2 — Big-story robustness (core)

4. **Two-pass ingestion for large inputs**: when the description exceeds an env-configurable threshold (`PLAN_OUTLINE_MAX_INPUT_CHARS`, ~8–12k chars), chunk the story by headings/paragraph windows → per-chunk entity-candidate extraction (compact JSON roster) → deterministic merge/dedupe by normalized name → bounded outline call from the merged roster + a synthesized synopsis. Every LLM call stays small regardless of story size; recall no longer depends on a single call.
5. **Bounded output**: explicit `max_tokens` on outline calls (env `LLM_OUTLINE_MAX_TOKENS`) and `finish_reason === 'length'` handling (retry with an item-count cap or split), eliminating the truncated-JSON failure mode.
6. **Fix the cwd bug** (operations §4.1): `LoreGenerator.ts` / `PromptFileGenerator.ts` → `resolveContentDir()`.
7. **Genuine big-story probe**: `FULL_INPUT=1` mode in `latency_probe.ts` that sends the entire file (no 1,200-char slice) and asserts item count + fill completion, so big-story ingestion is tested end-to-end.

### Phase 3 — Plan quality

8. **Coverage check**: compare the extracted entity roster against final plan items and show a "mentioned but not planned" list in the Review step with one-click add.
9. **Prompt guardrails**: condensed story-quality rules in `buildOutlinePrompt` (biography check, agency branches) aligned with `.agents/skills/story-processing/SKILL.md`.
10. **Item-scoped refine**: for large plans, send only the affected items to `refinePlan` instead of the whole plan JSON.

### Phase 4 — Hygiene

11. Fix `NEXT_STEPS.md` references (restore an index doc or repoint to `STORY_BUILDER_OPERATIONS.md`); refresh stale operations notes (§4.2); document big-story behavior in `DATA_INTAKE.md` Path B.

---

## 5. Recommendation & decision

Recommended scope: **Phase 1 + 2** as one milestone — Phase 1 makes failures visible, Phase 2 makes big stories actually work; items 6–7 are cheap and directly serve content order/completeness. Phase 3 follows once two-pass ingestion lands.

**Decision (2026-07-25)**: implementation deferred; this document captures the review. When scheduling, prefer the phase order above.

---

## 6. Verification (when implemented)

Per the AGENTS.md checklist:

- Server: `npm run lint --workspace=server`, `npm run build --workspace=server`, relevant `npm run test --workspace=server` suites.
- Admin (UI changes): `npm run lint --workspace=admin` and build.
- Rebuild + restart the server container, then verify with `docker exec las-flores-server wget -qO- http://localhost:3000/health` (in-container `wget`, not host `curl`).
- **Acceptance for Phase 2**: full-untruncated story-bible probe — `FULL_INPUT=1 INPUT_FILE=... npx tsx server/scripts/latency_probe.ts` — producing complete plan items with filled lore/prompt files under `content/`.

---

## References

- `docs/DATA_INTAKE.md` — intake paths (Path B = Story Builder)
- `docs/STORY_BUILDER_DESIGN.md` — design rationale and shipped state
- `docs/STORY_BUILDER_OPERATIONS.md` — operational findings and runbook (incl. the story-bible probe)
- `.agents/skills/story-processing/SKILL.md` — story-editing guardrails for agents
- `.kilo/plans/1784582839538-story-builder-async-fill-plan.md` — async-fill split that shipped

