# Story Builder Pipeline — Milestone Roadmap

## Completed

- **M49**: Relationship rollout to remaining characters. Conversions, audits,
  validation, and relationship-gate coverage finished. Per-arc audit records
  were reviewed, then removed as dev artifacts; durable rules live in
  `docs/RELATIONSHIP_ROLLOUT.md`.
- **M50**: Plan Intake CLI Completion & Live Validation. `npm run plan:intake`
  finished; unit tests + live-stack probe added; review URL, `created_by`,
  Neo4j deltas, and LiteLLM path verified; graph-assisted entity resolution
  (`EntityResolutionService`) and non-fatal consistency validation
  (`PlanConsistencyChecker`) added at the approve gate; curated
  `(:Alias)-[:ALIAS_OF]->(:Content)` seeding added. See
  `docs/STORY_BUILDER_OPERATIONS.md` §1.1 for the runbook and closure log.
- **M50c**: Intake Semantic Validation & Concern Flagging (2026-09-03).
  Whole-canon fuzzy entity match on every ADD delta (`EntityResolutionService.matchEntityName`),
  plan-level concern when no delta matches canon or input text
  (`IntakeSemanticValidator.ungrounded_plan`), per-delta input-grounding
  token-overlap check (`inputGroundingOverlap`), and mock-provider
  transparency annotation (`mock_provider`). All fail-open and additive. Unit
  tests (21), integration fixtures (`off-universe-input.txt` /
  `in-universe-input.txt`), ops docs (`STORY_BUILDER_OPERATIONS.md` §1.1.2).
  Standalone doc retired.
- **M50d**: Amend Annotation-Reply Parity Fix (2026-09-04). `plan:amend --annotation`
  now passes `existingDeltas` into `chatService.propose` and recomputes
  M50c semantic-concern notes after every reply, matching the `--instruction`
  path. New public `GraphIntakeService.semanticNotesForPlan` wrapper. Unit
  tests (4) in `tests/unit/annotationReplyParity.unit.test.ts`.
  Standalone doc retired.

- **M51**: Generalize Plan Intake to Admin HTTP Endpoint. `POST /admin/story-builder/plans/intake`
  added as a cleaner alias of `/plans/graph-intake` with proper actor attribution and
  `plan_intake` event emission. Unit tests (`plan-intake-cli.test.ts`) and integration
  tests (`plans-intake.integration.test.ts`) cover all acceptance criteria. Ops docs
  updated in `docs/STORY_BUILDER_OPERATIONS.md` §1.2. Standalone doc retired.

## Proposed sequence

1. **M52 — Admin Story Builder Review Flow Update**
   - Wire the admin Describe step to the new endpoint.
   - Remove/replace the pre-approval `PUT plan_json` block.
   - Fix critique and graph refresh for review.
   - Add admin Vitest + Playwright coverage.
   - File target: 25–35.

2. **M53 — Client Integration & Content Consumption Verification**
   - Audit and fix client API wrapper, Vite proxy, and server route contract.
   - Add client and server smoke/contract tests.
   - Verify login, dialogue, map, location, and settings flows.
   - File target: 20–30.

3. **M54 — Legacy Plan Pipeline: Stage Gate & Provenance Hardening**
   - Independent of M50/M50c/M51-53 — targets the older `ContentPlanService`
     pipeline, not `GraphIntakeService`.
   - Narrow `/plans/:id/stage` to require `approved` (not `proposed`), so
     files can never be written before a genuine review.
   - Add status-transition validation to `PUT /plans/:id`.
   - Stamp `plan_id`/`generated_at` provenance into written content at
     stage time, and sweep orphaned staged files on plan deletion.
   - Retire or fix the now-dead `latency_probe.ts`.
   - File target: 10–15.

## Suggested execution order

M52 → M53

M52 builds on M51 (already shipped). M53 is independent and can run in
parallel. M54 targets a different pipeline (`ContentPlanService`) entirely and
can run at any time.

Each milestone should be independently reviewable and mergeable. Keep changes
mechanical; avoid bundling refactors or unrelated cleanup into these milestones.
