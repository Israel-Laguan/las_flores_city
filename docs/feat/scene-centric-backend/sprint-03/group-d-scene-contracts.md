# Group D — Scene model: contracts, validation, storage (SC-301 / SC-302, 5 tasks)

All new types live in `api/contracts/src/scene/` (leaf module, imports nothing from planning
or runtime). Everything here is **pure data + pure functions** except D5 (tables).
Naming in code follows the SC-S12 answer; this file writes `Scene` for readability.

> **Status: ✅ Done (on branch `feat/sprint-03-group-d-scene-contracts`, 6 commits — SC-311 is two — not yet merged).** One commit per task, TDD. Deviations and facts downstream groups (E/F/G) rely on:
>
> **Deviations**
> - **Migration is `101_planning_scene_defs.sql`, not 099.** 099 (`migration_log_district`) and 100 (`…_validate`) were taken by the districts work. Same oltp array, same rules; Groups F/G text that says "097–099" should read "097–098, 101".
> - **Code name is `SceneDef`** (SC-S12), not `Scene`: `SceneDef`, `sceneDefToJSON/FromJSON`, `SceneDefRepository`, `InMemorySceneDefRepository`. Flag edges use entity type **`scene_def`** (not `scene` — bare "scene" = legacy location row in the graph/intake code).
> - **`location` is a UUID string** (hard ref to a legacy `public.scenes` row, per SC-S12 "What it changes"), *not* `{district_slug, location_slug}` as this file originally said. District is inherited from the location row.
> - **`time` is nullable** (`'day'|'sunset'|'night'|null`; `null` = any time), because SC-S12's importer seeds `time=null`. `weather` is `WeatherTag | null` (null = inherit).
> - **No `participants` field.** SC-S12's draft projection had one (seeded from `metadata.npcs`); it is in no D acceptance criterion, so it was not invented. F2/SC-315 will translate the UUIDs in `metadata.npcs` from the 4 legacy scenes into **pre-filled role slots** (`cast: <character_slug>`, `slot_id: <character_slug>`, and a default position like `center`). This avoids needing a separate `participants` field while still seeding the characters correctly.
> - **`SceneOverlay` / overlay repository not built** (Group E, E1). Migration 101 creates `planning.scene_overlays` (FK enforced) but nothing reads/writes it yet; `payload` there only requires a JSON object.
> - `planning.locations` mirror (SC-S12 importer output 1) is **not** in 101 — F2 needs it as a sibling migration (102) if `SceneDef.location` is to be an in-schema FK. Today `location` has no DB-level reference.
> - Boundary lint needed no change: `api/eslint.boundary.cjs` is per-workspace, so `contracts/src/scene` and `contracts/src/validation` are covered automatically; no new fixture added (leave to SC-318).
>
> **Final shapes** (`@las-flores/api-contracts`)
> - `SceneDef { id, slug, title, description, location, time, weather, items[], dialogue_refs[], role_slots: RoleSlot[], availability: ConditionExpr, priority }`; `createSceneDef(input)` defaults `availability=TRUE`, `priority=0`, empty lists, null time/weather. `dialogue_refs` is ordered, slugs not UUIDs; `items` is `string[]` (SC-S9 pending).
> - `RoleSlot { slot_id, cast: string|null, position: 'left'|'center'|'right' }`; strict key set (no personality/relationship keys). `SLOT_POSITIONS` parity-tested against `DialogueNodeVisualSchema` in `server/tests/unit/slotPositionParity.test.ts`.
> - Serialization: `SCENE_SCHEMA_VERSION = 1`; `sceneDefToJSON` = sorted top-level keys, `schema_version` stamped, no `undefined`; `stringifySceneDef` = the canonical bytes. `availability` is serialized by the existing condition `toJSON` (its fixed key order, not alphabetical — deterministic, so hashing is stable). `sceneDefFromJSON` throws `InvalidSceneDefError` (carries `.issues`) on any error-severity issue; warnings don't throw.
> - Validation: `validateScene(input, { knownFlags? }) → { valid, issues[] }`, issue = `{ code, path, message, severity: 'error'|'warning'|'hint' }` (type in `contracts/validation`, reuse it for E3 conflicts / SC-603 / SC-405). One pass, never throws. Codes (`SCENE_ISSUE_CODES`): `SCENE_NOT_OBJECT, SCENE_FIELD_UNKNOWN, SCENE_FIELD_MISSING, SCENE_FIELD_TYPE, SCENE_SCHEMA_VERSION_MISMATCH, SCENE_SLUG_INVALID, SCENE_LOCATION_INVALID, SCENE_TIME_INVALID, SCENE_WEATHER_INVALID, SCENE_PRIORITY_INVALID, SCENE_REF_SLUG_INVALID, SCENE_DIALOGUE_REF_DUPLICATE (warning), SCENE_SLOT_ID_INVALID, SCENE_SLOT_DUPLICATE, SCENE_SLOT_CAST_INVALID, SCENE_SLOT_POSITION_INVALID, SCENE_AVAILABILITY_INVALID, SCENE_AVAILABILITY_UNKNOWN_FLAG (warning, only with `knownFlags`)`. Table in `architecture.md` §6.1. Composition codes from SC-S13 (`SCENE_EXCLUSIVE_CONFLICT`, `SCENE_SLOT_CAST_CONFLICT`) are **not** defined here — E3 adds them.
> - Flag usage (`@las-flores/api-planning`): `extractFlagUsage` / `createFlagEdges` / `validateFlagReferences` accept `EntityPayload | SceneDef`; scene → `reads` from `availability`, `sets: ∅`, `writes: []`. Dialogue extraction pinned by a regression test.
> - Storage: `SceneDefRepository { create, get, list({includeRetired}), upsertIfChanged → {status: created|updated|unchanged, record}, retire }`; records carry `{slug, schemaVersion, scene, contentHash, createdAt, updatedAt, retiredAt}`. `sceneDefContentHash` = sha256 hex of `stringifySceneDef` — **the PG adapter (F1) must use it**. Retired slug is terminal (`create` throws, `upsertIfChanged` → `SceneDefRetiredError`); `list` hides retired by default. Contract helper: `server/tests/helpers/sceneRepositoryContract.ts` — F1 runs it from an integration test with its own slug prefix (like `flagRegistry.pg.test.ts`).
> - 101 facts: PK = slug (identifier CHECK), `payload->>'slug' = slug` CHECK, `content_hash ~ '^[0-9a-f]{64}$'`, overlay FK `NO ACTION` (a scene with overlays can't be hard-deleted), `updated_at` trigger via `planning._set_updated_at()` (from 096), grants: `planning` only (runtime/PUBLIC/las_flores revoked — asserted). Suite `planning-scene-defs.test.ts` is in `SCHEMA_SUITES`.
>
> **Verification:** api/contracts + api/planning lint/typecheck/jest green (134 + 34 tests; 3 pre-existing max-lines warnings only in `evaluate.test.ts`); `server` unit+smoke `--no-cache` 117 suites / 1346 tests green; `npm run test:integration:schema` for `planning-scene-defs`, `migration.schema`, `migration`, `runtime-planning-permissions`, `districts-weather` green against the local Podman Postgres.

---

## SC-301a · Scene core contract · M · P0 · needs SC-S12, SC-309a

**Shape (acceptance)**
`id`, `slug` (identifier-valid, reuse `validateFlagSlug` rules or a shared helper), `title`,
`description`, `location` (`district_slug` + `location_slug`), `time` (`day|sunset|night`,
matching `client/src/utils/time.ts`), `weather` (`WeatherTag | null` — `null` inherits the
district default; import `WeatherTag`/`validateWeatherTag` from `@las-flores/api-contracts`, **already merged** in SC-309a — tags: clear, overcast, rain, storm, fog, smog, dust), `items`, `dialogue_refs`, `availability` (see D4), `priority` (for
overlays; base scenes use 0).

- `items` shape is decided by SC-S9 (props only vs obtainable items). Until then it is `string[]` of item slugs with a `// SC-S9` note — do **not** invent an inventory ledger here.
- `dialogue_refs` reference dialogue trees/chunks by slug (not UUID), so scenes survive re-imports.
- Stable JSON serialization (sorted keys, no `undefined`) — it feeds content hashing in SC-403.
- Exported `SCENE_SCHEMA_VERSION` constant.

- m-39 Types + `toJSON`/`fromJSON` with the same strictness as `ConditionExpr`.
- m-40 Unit tests: round-trip, key-order independence of the serialized bytes.
- m-41 Re-export from `api/contracts/src/index.ts`.

---

## SC-302 · Role slots · M · P0 · needs SC-301a

**Acceptance**
- `role_slots: RoleSlot[]`, each `{ slot_id, cast: string | null, position }`.
- `slot_id` unique within a scene (validated, not just documented). `cast` is a character **slug** or `null` (= open for overlay/runtime assignment).
- `position` reuses the existing VN enum `'left' | 'center' | 'right'` from `shared/src/schemas/dialogue.ts:198` — import the *values*, but redeclare the type in contracts (contracts may not import `shared`; add a parity test that fails if the two diverge).
- Invariant from `proposal.md` §2.5: a slot never carries personality/relationship data — it only names a cast, so deleting a scene cannot corrupt a character.

- m-42 `RoleSlot` type + uniqueness validator.
- m-43 Parity test against the `shared` position enum.
- m-44 Unit tests: duplicate id, null cast allowed, unknown position rejected.

---

## SC-301b · Scene shape validator (tier-1) · M · P0 · needs SC-301a, SC-302

Pure `validateScene(input): ValidationResult` returning **structured issues**, not thrown
strings: `{ code, path, message, severity }`. The same issue format is reused by composition
conflicts (E3) and, later, SC-603/SC-405 — so fix the format now.

**Acceptance**
- Collects *all* issues in one pass (no first-error exit).
- Codes are stable string constants (`SCENE_SLUG_INVALID`, `SCENE_SLOT_DUPLICATE`, `SCENE_TIME_INVALID`, …) with a documented table.
- Does **not** check cross-entity references (that is tier-2, SC-604) — only shape. Say so in the file header.

- m-45 Issue type + code table in `contracts/validation`.
- m-46 `validateScene` + table-driven tests (one case per code).
- m-47 Document the code table in `architecture.md` §(validation tiers).

---

## SC-310 · Scene availability condition + flag-usage extraction · M · P0 · needs SC-301a

Scenes and overlays are gated by the **same** condition grammar as dialogue and missions
(F2 — `proposal.md` "same grammar" rule). No second grammar.

**Acceptance**
- `availability: ConditionExpr` (default `{type:'true'}`) on scenes and (E1) overlays; serialized through the existing `toJSON/fromJSON`.
- `extractFlagUsage` in `api/planning/src/edges/flag-tracking.ts` is extended to a scene payload: `reads` = slugs in `availability` (via `extractFlagSlugs`, not a second parser); `sets` = flags from scene effects **if** the scene carries any (it does not yet — assert `sets: []` and note it).
- Output shape is unchanged for existing callers (SC-S1: consumable by a later `entity_edges` projection).

- m-48 Add `availability` to the scene schema and validator (unknown flag slug → warn, tier-2 later).
- m-49 Extend `flag-tracking.ts` + test for a scene payload.
- m-50 Regression test: existing dialogue payload usage extraction unchanged.

---

## SC-311 · Planning storage: migration 101 (was 099) + `SceneDefRepository` · M · P1 · needs SC-301a, SC-302, SC-S12

**Scope in**
- `101_planning_scene_defs.sql` (oltp array; reserved as 099, renumbered — see status): `planning.scene_defs` (`slug` PK, `schema_version`, `payload jsonb`, `content_hash text`, `created_at`, `updated_at`, `retired_at`) and `planning.scene_overlays` (`slug` PK, `base_scene_slug` FK → `planning.scene_defs(slug)`, `priority int`, `payload jsonb`, `content_hash`, same timestamps). `payload` is the contract JSON — columns exist only for keys we filter on (slug, base, priority, hash). `REVOKE ALL … FROM runtime, PUBLIC` — the default privileges in 095 grant `planning` only; assert it.
- `SceneDefRepository` interface in `api/planning/src/canon/` (create/get/list/upsertIfChanged/retire; **never delete**) + an in-memory implementation, exactly as `FlagRegistry` was done. `upsertIfChanged` compares `content_hash` (the seed of SC-403's idempotency).

**Scope out:** the Postgres adapter (F1) and anything the runtime reads.

**Acceptance**
- Migration idempotent; FK from overlay to scene enforced by the DB.
- Repository contract test suite parametrised over implementations (reuse BF-303's pattern).

- m-51 Write 099, register in `migration-targets.json`.
- m-52 `SceneDefRepository` + in-memory implementation.
- m-53 Shared contract-test helper `sceneRepositoryContract(factory)`.
