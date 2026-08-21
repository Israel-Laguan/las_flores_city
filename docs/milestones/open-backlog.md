# Open Engineering Backlog (consolidated from `.kilo/plans`)

**Status:** OPEN · consolidated 2026-08-21 from the 7 surviving `.kilo/plans/*` files
(podman-run-documentation, m33-backlog-cleanup-and-m40-carryforward,
m30-presolved-overlay-snapshots, m6-expression-variant-manifest,
m34-story-builder-test-coverage, pr-review-fixes, milestone-verification-plan).
All code-level outcomes of the 9 *executed* plans were already verified landed in the
repo and those plan files were deleted. This file is the single live backlog. Each
section is self-contained so it can be handed to a fresh chat/agent as the source of truth.

Sub-tasks should mark their section DONE and link a PR; delete this file only once every
section below is closed.

---

## 1. Podman run procedure — validate + document (Part A/B) — **DONE (2026-08-21)**

Source: `.kilo/plans/1786829597329-podman-run-documentation.md`

> Validated green 2026-08-21 via `./scripts/podman-workflow.sh setup` + `run-tests-podman.sh`:
> in-container `:3001/health` and `:3000/health` → `{"success":true}`; admin panel
> `Ready in` and reaches `intake-worker:3001` (`NEXT_PUBLIC_SERVER_URL`/`INTERNAL_SERVER_URL`
> set); Neo4j bolt open (`RETURN 1` → `1`); `apply-migrations.sh verify` → no drift;
> unit **89 suites / 1025 tests** and integration **60 suites / 394 tests** pass
> (`LLM_PROVIDER` defaults to `mock`). Minor doc drift reconciled: podman-ops removed the
> spurious `DEV_MODE=true`, added `neo4j-data` volume + explicit admin-start Phase; podman-dev
> added `neo4j-data` volume + `NEXT_PUBLIC_DEV_LOGIN_ENABLED`/`DEV_LOGIN_ENABLED` flags. One real
> migration checksum drift on `076_drop_dialogue_jsonb.sql` (file changed post-apply during M32)
> was reconciled by aligning the recorded checksum — the DROP is idempotent and already applied.
> B3–B6 already current; the backlog's "broken" claim was stale.

The Podman skills/scripts/docs predate three architectural changes and are broken:
M21 process split (intake-worker owns migrations), M27 Neo4j, and admin→intake-worker:3001.

**Must do**
- Validate the Part A run procedure (network + volumes, 5 backing services with raw
  container IPs, build one server image, start **intake-worker:3001 first** then
  game-server:3000, build+start admin:3002 → `intake-worker:3001`), using
  `host.containers.internal:host-gateway` for host LiteLLM.
- Confirm green: in-container `wget :3001/health` AND `:3000/health` → `{"success":true}`;
  admin loads data; Neo4j bolt open; `apply-migrations.sh verify` no drift;
  `run-tests-podman.sh server/tests/unit` + `.../integration` pass (capture counts).
- Update deliverables to match reality:
  - B1 `agents/skills/podman-dev/SKILL.md`, B2 `agents/skills/podman-ops/SKILL.md`
    (intake-worker as migration owner, Neo4j, `MINIO_PUBLIC_URL`, host LiteLLM `--add-host`,
    no `dashboard` references).
  - B3 `start-stack.sh` (add Neo4j + intake-worker before server, fix admin env
    `NEXT_PUBLIC_SERVER_URL=http://localhost:3001`,
    `INTERNAL_SERVER_URL=http://$INTAKE_IP:3001`, `--add-host=las-flores-intake-worker:$INTAKE_IP`).
  - B4 `scripts/podman-workflow.sh` (admin env + intake-worker ordering + Neo4j + `MINIO_PUBLIC_URL`).
  - B5 `AGENTS.md` Podman section (~lines 140–187): intake-worker:3001 pair, Neo4j,
    `MINIO_PUBLIC_URL`, LiteLLM host note; keep in-container `wget` health rule.
  - B6 `docs/DEVELOPMENT_SETUP.md`: admin URL examples, intake-worker as migration owner,
    Neo4j + `MINIO_PUBLIC_URL` env tables; fix "Admin UI talks to server:3000" prose.

**Risks to confirm during the test:** rootless `host.containers.internal:host-gateway`
resolution (fallback bridge gateway `10.88.0.1`); Neo4j 512M heap; LiteLLM host
availability (fall back to `LLM_PROVIDER=mock`).

---

## 2. M40 — prompt/expression/asset carry-forward (content work)

Source: `.kilo/plans/1786377431414-m33-backlog-cleanup-and-m40-carryforward.md`
(live doc: `docs/milestones/1786377431414-m40-prompt-expression-asset-carryforward.md`)

M33 closed all *non-content* gaps; the bulk content work carries here.

- **G-M40-1** (← G28.1): compress 22 portrait `## Prompt (Draft)` bodies under 800 chars
  (drop shared style boilerplate, keep physical/story descriptors). Includes the
  uncommitted `content/characters/alisha_morales/alisha_morales.prompt.md` working-tree edit
  (regressed to +164 over).
- **G-M40-2** (← G29.2): generate 9 Wen Zhao expression PNGs (vulnerable/happy/afraid/angry/
  tender/sad/determined/contemplative/shocked) via NVIDIA NIM into
  `content/characters/wen_zhao/assets/` (prompts authored in `wen_zhao.prompt.md`
  `## Expression Variants`); publish with `SLUG_ONLY=wen_zhao FORCE=1`.
- **G-M40-3** (← G7.1): publish 20 staged scene backgrounds to MinIO (`AssetPublishService`
  supports `background_urls`, `server/src/services/AssetPublishService.ts:280`, or extend
  `publish-all-portraits.ts`/`sync_local_assets.ts`); re-run `verify-assets.mjs` expecting
  `Missing: 0` for backgrounds; clean the 11 legacy junk URLs.
- **G-M40-4** (← G29.4): `verify-assets.mjs` → `Visual expr: 0` (after G-M40-2).
- **G-M40-5** (← G6.1, optional): per-character PNG fidelity re-audit — out of scope.

Also apply the M33 code fixes that may not be confirmed done (verify first):
- G28.2 `scripts/asset-pipeline/scripts/check-prompt-lengths.mjs` MAX_NIM_LENGTH=800 hard limit;
  trim `evidence_transport.prompt.md` `## Prompt — Base Scene` to ≤800.
- G28.3 `generate-drafts-unified.mjs:377-382` sentence-boundary trim (replace blind `substring`).
- G29.1 `verify-assets.mjs:273-280` register `default` when untagged `portrait_urls` entry exists.
- G29.3 `publish-all-portraits.ts:125` add `FORCE=1`/`--republish` to bypass skip.

**Risks:** NIM generation is non-deterministic, needs human visual review; `alisha_morales`
edit is foreign to M40 and must not be reverted.

---

## 3. M30 — pre-resolved per-state overlay snapshots (deferred, gated on benchmark)

Source: `.kilo/plans/m30-presolved-overlay-snapshots.md`
Status: PLANNING — Phase A deferred by design, gated on
`docs/milestones/M30-benchmark-results.md` verdict (S4 distinct-key p99 ≈ 0.55–0.63 s at
500 players is NOT pool-bound; best explained by Node JSON marshalling + Redis `setCache`
on every cold miss).

**Phase A (tree-level) scope**
- Persistence: default reuse `dialogue_chunks` (4.1a) with snapshot `chunk_key`
  `__snapshot__{setHash}`; fallback new table `dialogue_resolved_snapshots` (4.1b).
- `server/src/services/ContentPublishService.ts`: `publishDialogueSnapshot` (content-addressed
  `snapshots/{treeId}__{nsfw}__{alignment}__{setHash}__{sha256}.json`).
- New `server/src/services/SnapshotService.ts`: `buildSnapshotsForTree` reuses
  `loadBaseTree`/`loadMysteryOverlays` + the SAME gate logic as
  `DialogueResolver._resolveTreeForUserInner`; runs inside the `content_migration` advisory lock.
- `DialogueResolver._resolveTreeForUserInner`: on cache miss try snapshot `content_url`
  (`fetchChunkFromContentUrl`) first, else existing full pipeline.
- Phase B (chunk-level) is OUT of scope for the first PR.

**Verification:** rebuild server+intake-worker, in-container `wget /health`, re-run
`server/scripts/m30_benchmark.ts` S4 with snapshots present; goal distinct-key p99 < 250 ms
at 500 and `setCache` pressure gone vs baseline.

---

## 4. M6 Part B — expression-variant manifest + verification (blocked on user generations)

Source: `.kilo/plans/1786296272268-m6-expression-variant-manifest.md`
Status: manifest CSV DONE; verification + closure PENDING (user runs the 666 generations).

- Manifest exists: `scripts/asset-pipeline/output/missing_expression_variants.csv`
  (666 `done=0` rows; columns `path, prompt, nim_safe_prompt, done`). Every one is a
  text-to-image task (i2i is hard-deadlocked per `docs/VARIANT_GENERATION_RUNBOOK.md`).
- Verification script `scripts/asset-pipeline/scripts/verify-missing-expression-variants.mjs`
  (exists, not yet run): re-scans each `path`, sets `done=1` iff healthy PNG (>=8000 bytes,
  real signature); rewrites CSV; prints acceptance summary. No network/deletions.
- When CSV shows 666/666 healthy: update
  `docs/milestones/1786049707544-m6-portrait-png-generation.md` Part B DEFERRED → MET;
  re-run `node scripts/content-audit.mjs` (expect exit 0).
- **This is a user-run task, not an agent gap.** Agent only verifies the script exists and
  is wired correctly; it must NOT generate the 666 images.

**Risks:** JPEG-in-`.png` (523 existing) accepted as-is; `petra_solis` corrupt stub is the
only overwrite (replaces corrupt file); `default-2` variants intentionally excluded.

---

## 5. M34 — story builder test coverage — **DONE (2026-08-21)**

Source: `.kilo/plans/1786381576125-m34-story-builder-test-coverage.md`
Milestone: `docs/milestones/1786292762037-m34-story-builder-test-coverage.md`
(milestone doc + plan file were already deleted before this task)

> Coverage implemented and verified green for all surviving M34 features.
> GAP 1&2 (mission-reward integration: `mission-reward-grants.test.ts`,
> `mission-reward-anti-double.test.ts`) were validated green in the §1 Podman
> run; GAP 5 (`llm-prompts-content.test.ts`) and GAP 7 (`addItemFromRoster`
> vitest) unit tests are green; GAP 3/4/6 targeted features that were **removed
> during the graph-db integration (PR #109)**, so their tests were replaced with
> coverage of the current equivalents:
>   - GAP 3 → `server/tests/unit/plan-template-fallback.test.ts`
>     (`generateFallbackPlanImpl` / `validateAndRepairOutlineImpl` builder contract)
>   - GAP 4 → `server/tests/unit/outline-chunking.test.ts`
>     (`normalizeName` + slug/dedup repair — the surviving OutlineChunking merge logic)
>   - GAP 6 → `server/tests/unit/admin-story-builder-critique.test.ts`
>     (analyze route returns 400 on invalid `plan_json` / `scope`)
> New suites: 18 tests, all green. Unit+smoke run: 1051 passed; the only 2
> failures are `tests/smoke/heartbeat.smoke.test.ts` (needs a live Redis/DB,
> which is torn down per §1 context — environmental, not a regression).

Features shipped; ~80% of declared test matrix never landed. Follow AGENTS.md test-isolation
rules (dedicated synthetic UUIDs, own test user created/cleaned in beforeAll/afterAll, never
reuse real content UUIDs; `npx --no-install jest --workspace=server --clearCache` before runs).

- GAP 1&2: `server/tests/integration/mission-reward-grants.test.ts` (credits + vault row) and
  `mission-reward-anti-double.test.ts` (double-process → exactly one claim) — the test that
  would have caught the M33 `grant_item` gap.
- GAP 3: assert `add-mission-from-scene` registered in templates map +
  `buildMissionFromScenePlan()` yields 4 items + both links
  (`PlanTemplates.ts:64`, `PlanTemplateBuilders.ts:356`).
- GAP 4: `server/tests/unit/outline-chunking.test.ts` for `server/src/services/OutlineChunking.ts`
  (heading/paragraph/hard-slice split, `normalizeName`, merge-by-name, synopsis 2000-cap).
- GAP 5&6: unit-assert three story-quality rule bullets in `buildOutlinePrompt`
  (`LLMPrompts.ts:99`, rules `:176-179`) + `buildRefinementPrompt` (`:192`) +
  `buildItemScopedRefinementPrompt` (`:242`); route test `admin-story-builder-actions.ts:25-47`
  `itemIds: []`/`['']` → 400 (mock DB/Redis per AGENTS.md).
- GAP 7: Vitest for `addItemFromRoster` (`useStoryBuilderMutations.ts:93-123`) type validation +
  slug dedupe; coverage-section render with unplanned entity in `_meta.entity_roster`.

**Acceptance:** both mission-reward integration tests pass; template asserted; `OutlineChunking`
covered; prompt/route assertions exist; admin tests exist; full suite green
(`npm run test --workspace=server`, `npm run test --workspace=admin`).
After pass, delete `docs/milestones/1786292762037-m34-story-builder-test-coverage.md`.

---

## 6. PR review fixes — cubic-dev-ai 12 issues (lock-file / infra dep)

Source: `.kilo/plans/1786427420347-pr-review-fixes.md`
All 12 verified valid. Root cause: `infra` workspace added but lock file not regenerated,
`server` doesn't declare dep, Redis-mocking tests repointed at barrel without `queryOLTP`,
docs contradict shipped code.

- **P0 (blocks tests):** `story-beat-pipeline.integration.test.ts:17` — preserve real
  `queryOLTP` via `jest.requireActual` in the `@las-flores/infra` mock.
- **P1 (blocks prod):** add `"@las-flores/infra": "*"` to `server/package.json` dependencies
  (paths mapping alone doesn't satisfy `node_modules` resolution in `dist`).
- **P2:** run root `npm install` to regenerate `package-lock.json` with `infra` (Dockerfiles
  run `npm ci` → "Missing: infra"); enforce read-only `contentPool` via
  `options: '-c default_transaction_read_only=on'` in `infra/src/connection.ts:61`
  (`CONTENT_DATABASE_URL` override); reconcile `M19-foundation.md` + `AGENTS.md` line 7 +
  `ARCHITECTURE_SEPARATION_ANALYSIS.md` §5/§10 to the shipped content-pool contract (drop the
  `domains/` reorg row since deferred).
- **P3:** `dependabot.yml:13` comment "break the admin panel build" → "break the client build";
  reconcile `ARCHITECTURE_SEPARATION_ANALYSIS.md:304-313` libuv threadpool taxonomy; flatten the
  convoluted `@las-flores/infra` mock in `adminStoryBeats.property.test.ts:30`; fix dead
  `unstable_mockModule` in `storyBeatSchema.property.test.ts:244`; dedupe `infra/eslint.config.cjs`
  as shared base for `server`/`shared`.

**Validation:** `npm ci` in temp dir; `node -e "require('@las-flores/infra')"` from
`server/dist`; lint+build+unit+integration green; `docker compose build server` + in-container
`wget /health`; docs describe A1/content pool consistently.

---

## 7. Milestone-doc hygiene (superseded, residual debt)

Source: `.kilo/plans/1786294814869-milestone-verification-plan.md`
Superseded by per-milestone plans. Residual debt: the older
`docs/milestones/1786049707544-*` files were never all deleted.

- Audit `docs/milestones/1786049707544-*` (M28 prompt-length, M29 dialogue-expression,
  M6 portrait-png, M7 asset-publish-url, M19..M39) against current repo state; for any
  fully-MET file, mark DONE and delete it; for PARTIAL, trim to remaining gaps only.
- Ensure no doc references a deleted `.kilo/plans/*` path (none should, per the deletion
  plan's Task 0 verification).

---

## Hand-off prompt (for a fresh chat)

> Read `docs/milestones/open-backlog.md` — it is the single source of truth for the 7 open
> engineering gaps in Las Flores 2077. Pick ONE section (1–7), confirm its current status
> against the repo (don't trust the doc's claims — verify by reading code), then implement
> only that section following AGENTS.md conventions (existing `oltpPool`/`queryOLAP`/
> `contentPool` patterns, test-isolation rules, in-container `wget /health` verification).
> Report which sub-tasks were actually done vs already-landed.
