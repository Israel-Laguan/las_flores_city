# Data Intake

> Long-term reference for how content enters the Las Flores 2077 system. This doc covers the three intake paths — direct YAML authoring, the Story Builder wizard, and lore-to-asset generation — plus the shared guardrails that apply to all of them.
>
> Last updated: 2026-07-14

---

## Overview

All game content eventually lands in the OLTP Postgres database as typed rows. The source of truth for most content, however, is **file-based**: YAML under `content/` and markdown under `docs/lore/`. The database is a validated, queryable mirror of those files.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA INTAKE PATHS                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Path A: Direct YAML authoring                                      │
│  content/*.yaml  →  validate  →  migrate  →  Postgres               │
│                                                                     │
│  Path B: Story Builder                                              │
│  description  →  AI plan  →  review  →  stage  →  migrate  →  DB    │
│                                                                     │
│  Path C: Lore + asset generation                                    │
│  docs/lore/*.md  →  .prompt.md  →  AKOOL  →  assets  →  content     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Path A: Direct YAML authoring

The simplest and most common path. Authors edit YAML files under `content/`, then run validation and migration.

### File layout

```text
content/
├── characters/        # char_<slug>.yaml
├── dialogues/         # dialogue_<slug>.yaml
├── scenes/
├── missions/
├── mysteries/
├── stories/
├── overlays/
├── locations/
├── vault/
├── gigs/
├── shop/
├── maps/
└── story_beats.yaml   # registry of canonical story beats
```

### Pipeline

| Step | Command / entry point | What it does |
|---|---|---|
| Author | Edit YAML by hand or via `/editor` | Produces or updates a content file |
| Validate | `npm run validate:content` (or `/validation` admin page) | Runs Zod schema checks, XSS checks, story-flow validation |
| Migrate | `npm run migrate:content` (or `/migration` admin page) | Reads YAML, upserts rows in Postgres, writes `migration_log` |
| Inspect | `/characters`, `/dialogues`, etc. admin pages | Browse migrated content |

### Key files

| File | Role |
|---|---|
| `shared/src/schemas/yaml-content.ts` | Zod schemas for each content type |
| `shared/src/schemas/content-validation.ts` | Content type enum + validation helpers |
| `server/src/content/validate.ts` | Validation pipeline (schema + XSS + story flow) |
| `server/src/content/migrate.ts` | Migration pipeline (YAML → DB upsert) |
| `server/src/content/upsert.ts` | Per-type upsert logic |
| `server/src/routes/admin-content.ts` | Admin endpoints for file tree, read, write |
| `admin/src/app/editor/` | Raw YAML editor UI |
| `admin/src/app/validation/` | Validation report UI |
| `admin/src/app/migration/` | Migration status + result UI |

### Safety properties

- **Atomic writes**: the admin file-write endpoint writes to a `.tmp` file and renames it.
- **Migration log**: every migrated file is recorded so re-runs are idempotent and drift can be detected.
- **Validation gates**: invalid YAML cannot be migrated until it passes `validateContent()`.

---

## Path B: Story Builder

A wizard-driven path for creating or updating multiple related content items from a natural-language description. Useful for coordinated additions like "add a bartender named Diego who works at the Plaza".

### Flow

```text
Describe  →  AI Proposal  →  Review/Refine  →  Approve  →  Stage  →  Migrate  →  Assets
```

| Step | Admin page | Server action |
|---|---|---|
| Describe | `/story-builder` step 1 | `POST /admin/story-builder/plan` |
| Review | `/story-builder` step 2 | Load plan, edit items, refine with `POST /plans/:id/refine` |
| Approve | `/story-builder` step 2 | `PUT /plans/:id` with `status: approved` |
| Stage | `/story-builder` step 3 | `POST /plans/:id/stage` writes YAML + lore stubs + prompt files, validates |
| Migrate | `/story-builder` step 4 | `POST /plans/:id/migrate` upserts to DB |
| Assets | `/story-builder` step 5 + `/assets` | Generate/assign assets from the plan's `assetNeeds` |

### Key files

| File | Role |
|---|---|
| `shared/src/schemas/story-builder.ts` | `ContentPlan`, `ContentPlanItem`, `AssetNeed`, `ContentLink` schemas |
| `server/src/services/ContentPlanService.ts` | Parse description, refine plan, inject asset needs |
| `server/src/services/StoryBuilderOrchestrator.ts` | `previewPlan`, `stagePlan`, `migrateStagedPlan` |
| `server/src/services/ContentSkeletonGenerator.ts` | Template-based YAML skeletons per content type |
| `server/src/services/AssetNeedsService.ts` | Static asset-needs rules per content type |
| `server/src/services/LoreGenerator.ts` | AI-generated lore markdown for plan items |
| `server/src/services/PromptFileGenerator.ts` | `.prompt.md` files for the asset pipeline |
| `server/src/services/StoryBuilderFileWriter.ts` | Atomic file writes + rollback |
| `server/src/routes/admin-story-builder*.ts` | Express routers for plan CRUD, actions, lore, meta |
| `admin/src/app/story-builder/` | 5-step wizard UI |
| `admin/src/app/story-builder/plans/` | Saved plan list + version history |

### Safety properties

- **Stage before migrate**: YAML is written and validated before any DB mutation.
- **Atomic rollback**: if staging fails, written files are rolled back using `fileSnapshots`.
- **Plan versioning**: refinements create new versions linked via `parent_plan_id`.
- **Non-fatal lore generation**: AI lore generation is wrapped in `try/catch`; a failed lore call does not block plan creation.

### File-driven ingestion (story bible → plan)

The Story Builder path can be driven end-to-end from a long-form markdown brief (e.g. `~/Downloads/posts-compilation-complete.md`) instead of a typed description. The canonical harness is `server/scripts/latency_probe.ts`, which:

1. Reads the input file (`INPUT_FILE` env, default `~/Downloads/posts-compilation-complete.md`).
2. Derives the description from the file's first heading + a body brief.
3. Logs in, `POST /admin/story-builder/plans` (LLM mode), `PUT .../plans/:id` to `verified`, then polls asset needs until terminal.

The LLM pre-fill step calls `ContentPlanService.gatherContext()`, which must match the live schema: scenes are joined to `districts` (the old `scenes.district` column was dropped in migration `033`), and **locations are read from `content/locations/*/*.yaml` — there is no `locations` DB table**. A mismatch here throws before `stagePlan` writes any files, so the plan goes `failed` and no `content/` folders are produced. This was the root cause of an earlier "no output" ingestion run.

### Open questions

See `docs/STORY_BUILDER_DESIGN.md` §6 for unresolved design questions and §4.4 for future extensions.

---

## Path C: Lore + asset generation

The narrative layer lives as markdown in `docs/lore/`. From that lore, the system generates prompt files and, ultimately, art assets.

### Flow

```text
docs/lore/figures/<slug>/<slug>.md
        ↓
scripts/generate-lore-stubs.mjs  (or Story Builder's LoreGenerator)
        ↓
scripts/asset-pipeline/scripts/generate-prompt.mjs
        ↓
content/<type>/<slug>/<slug>.prompt.md
        ↓
AKOOL pipeline (/assets admin page)
        ↓
MinIO + asset_bases / asset_variants tables
        ↓
/admin/content/assign-asset  →  content YAML updated with asset URLs
```

### Key files

| File | Role |
|---|---|
| `docs/lore/` | Narrative source of truth (characters, locations, stories, events, etc.) |
| `scripts/generate-lore-stubs.mjs` | Creates placeholder lore markdown from content |
| `scripts/asset-pipeline/scripts/generate-prompt.mjs` | Creates `.prompt.md` files from lore/registries |
| `server/src/routes/assets.ts` | Asset catalog, generation, approval, publish endpoints |
| `server/src/routes/admin-content-asset.ts` | Assign a published asset URL to a content YAML field |
| `admin/src/app/assets/` | Asset generation pipeline UI |
| `admin/src/app/asset-coverage/` | Lore-to-content coverage report |

### Safety properties

- **Prompt catalog is read-only at runtime**: the server scans `PROMPT_ROOT` and serves it; it does not mutate prompt files via API.
- **Asset assignment writes YAML**: assigning an asset to a content field is a YAML edit, so it goes through the same atomic-write + migration path as any other content change.

---

## Shared guardrails

All three paths share the same validation and migration infrastructure.

| Guardrail | Where it lives | What it enforces |
|---|---|---|
| Zod schemas | `shared/src/schemas/` | Every content type has a typed shape. |
| XSS checks | `server/src/content/validate.ts` | No unsafe HTML/JS in text fields. |
| Story-flow validation | `server/src/content/validate.ts` | Dialogue nodes and story beats are reachable and consistent. |
| Migration idempotency | `server/src/content/migrate.ts` + `migration_log` | Re-running migration does not duplicate rows. |
| Path safety | `server/src/routes/admin-content.ts`, `StoryBuilderFileWriter.ts` | File writes stay within `content/` or `docs/lore/`. |
| Asset-needs rules | `server/src/services/AssetNeedsService.ts` | Every plan item gets predictable asset requirements. |

---

## How the paths relate

- **Direct YAML** is the baseline. Most existing content was authored this way.
- **Story Builder** is the high-leverage path for new, coordinated content. It still produces YAML, so it feeds back into Path A's validation and migration.
- **Lore + assets** is the narrative/art layer. It can be triggered by the Story Builder (via `LoreGenerator` and `PromptFileGenerator`) or run independently from scripts.

---

## References

- `docs/ADMIN_ARCHITECTURE.md` — Admin panel structure and conventions
- `docs/STORY_BUILDER_DESIGN.md` — Story Builder design rationale and shipped state
- `docs/NEXT_STEPS.md` — open action items
- `docs/UI_STYLE_SYSTEM.md` — Shared styling contract
- `AGENTS.md` — Hard constraints (DB/cache patterns, Docker gotchas, verification checklist)
