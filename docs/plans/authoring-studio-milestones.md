# Authoring Studio — Unified Pipeline + Story Bible + AI Config

> Milestone plan for consolidating admin into an **authoring studio** centered on four pillars: Story Bible, Narrative, AI Configuration, and Intake.
>
> **Created**: 2026-07-27
> **Status**: Draft (design + phasing agreed)
> **Related**: `docs/ADMIN_ARCHITECTURE.md`, `docs/DATA_INTAKE.md`, `docs/STORY_BUILDER_DESIGN.md`, `docs/UI_STYLE_SYSTEM.md`, `AGENTS.md`

---

## 1. Context

Las Flores 2077's admin panel grew 28 pages across four nav sections as content types and tooling were added incrementally. The current authoring journey is fragmented across 8 separate pages:

```text
Editor → Validation → Migration → Assets → Asset Coverage → Asset Promotion + Diff + Quality
```

Meanwhile the server already exposes every endpoint the consolidated flow needs (`/admin/content/validate|migrate|status|file|tree`, `/admin/content/assign-asset`, `/admin/content/assets/promote-*`, `/assets/publish`, `/admin/coverage/assets`). There is also a fully built Story Builder wizard (Path B intake) that generates content via LLM, and a working `/lore` browser, `/settings` key-value editor, and `/story-arc` coverage dashboard.

**Key finding from exploration:** The admin has all the building blocks for a full authoring studio — they just need to be surfaced around four pillars consistent with how external authoring tools (novel-writing tools, narrative-design tools like articy:draft/Arcweave/Twine) organize themselves.

### 1.1 The four-pillar framework

| Pillar | External-authoring-tool analogy | What we have today | This plan addresses |
|---|---|---|---|
| **Story Bible** | The canon reference (world-building, character profiles, lore) | `docs/lore/` world research, `content/lore/` canon files, per-entity `<slug>.md`, `/lore` browser page with edit + create support via `POST /admin/lore/file` | Phase 3 complete: `/lore` is editable and supports new lore file creation |
| **Narrative / Chapters** | Scenes/acts/chapters board (what happens in what order) | `/story-arc` coverage dashboard, `/stories`, `/story-beats`, `/missions`, `/mysteries`, `/gigs`, `/dialogues`, `/overlays` — all functional but scattered | Phase 5: nav consolidation groups them under "Narrative" and positions Story Arc as the "chapters map" |
| **AI Configuration** | Model settings, prompt guidelines, generation controls | `LLMService`/`LiteLLMProvider`/`LLMPrompts`/`LLMCostEstimator`, 12 env tunables (`LLM_MODEL`, `LLM_TIMEOUT_MS`, `PLAN_FILL_CONCURRENCY`,...), generic `/settings` key-value store, `PROMPT_GUIDELINES.md`, asset prompt catalog — none surfaced as "here's what your AI runs on" | Phase 4: read-only config page + one server endpoint |
| **Intake** | New-content creation workflow (two flavours: manual step-by-step, AI-assisted) | Path A (manual YAML → validate → migrate) has scattered pages; Path B (Story Builder AI wizard) is complete with its own stepper | Phase 2: unified Path A intake pipeline; Story Builder stays as Path B peer |

### 1.2 Design decisions

1. **Additive architecture.** The `/pipeline` intake page and the Story Bible edit mode are new routes; existing standalone pages (`/editor`, `/validation`, `/migration`, `/assets`, etc.) remain reachable under a "Tools" nav section as advanced/standalone views.

2. **Component extraction.** Reusable step components move from page folders to `admin/src/components/`. Both the pipeline and the standalone pages import from the same source.

3. **Soft gating.** The intake pipeline hard-blocks progression only on validation errors. Migrate failures, missing assets, and unpublished state warn but allow "Continue anyway".

4. **Asset generation stays on `/assets`.** The pipeline deep-links to it with the entity pre-selected; building generation into the pipeline itself is deferred.

5. **LLM config is read-only v1.** Making env-driven settings live-editable requires `LLMService` to read the settings table with env fallback — a real behavior change with restart semantics. Phase 4 surfaces what's *currently configured*; runtime overrides are deferred.

### 1.3 Storage model brainstorming

The intake pipeline is **session-based** (local state + `?step=` URL param for deep-linking) — following the same rationale as Story Builder's Option A (see `docs/STORY_BUILDER_DESIGN.md §3.3`). Persistence can be added later if authors need to resume interrupted pipelines across sessions; the story-arc coverage dashboard already serves as the long-term audit surface (which entities have been migrated, promoted, etc.).

### 1.4 What is not in scope (any milestone)

- Runtime LLM overrides via the settings table (needs server behavior change)
- Lore coverage dashboard (which entities lack lore) — existing coverage plumbing but a dedicated view is its own task
- Narrative cross-linking map (arc → story → beat → mission relational view)
- Moving AKOOL asset generation into the pipeline
- `@las-flores/ui` wrapper adoption sweep ("button", "card", "badge" component wrapper adoption)
- Game client (`client/`) UI

## 2. Milestones

### M1 — Component extraction (M1: extract)
**Scope:** Pure refactor — move shared UI + data-fetching pieces into `admin/src/components/`. Zero behavior change, zero new routes.

| Component | Source | Destination |
|---|---|---|
| `FileTree.tsx`, `EditorPanel.tsx`, `useEditor.ts` (+ `.module.css`) | `app/(admin)/editor/components/` + `hooks/` | `components/editor/` |
| `ValidationSummary.tsx`, `ErrorsByFile.tsx`, `WarningsByFile.tsx` (+ `.module.css`) | `app/(admin)/validation/components/` | `components/validation/` |
| `MigrationResultView.tsx`, `MigrationStatusView.tsx` (+ `.module.css`) | `app/(admin)/migration/components/` | `components/migration/` |
| `PromotionRow.tsx`, `useAssetPromotion.ts` (+ `.module.css`) | `app/(admin)/asset-promotion/components/` + `hooks/` | `components/promotion/` |

**Tests:** Run existing Vitest suite; update import paths in any per-page tests. No new tests.

**Verification:**
```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
```

---

### M2 — Intake pipeline (M2: pipeline)
**Scope:** New route `admin/src/app/(admin)/pipeline/` — 5-step guided manual intake flow.

**Files:**
- `page.tsx` — thin client shell, `?step=` query param sync
- `hooks/usePipeline.ts` — orchestration state machine (edit → validate → migrate → assets → publish); hydrates from `/admin/content/status`, `/admin/coverage/assets`, `/admin/content/assets/promotion-status`; hard-block on validation errors only
- `components/Stepper.tsx` — horizontal step indicator (done ✓ / current / blocked, clickable)
- `components/steps/EditStep.tsx` — FileTree + EditorPanel (M1)
- `components/steps/ValidateStep.tsx` — Run + ValidationSummary + ErrorsByFile + WarningsByFile (M1)
- `components/steps/MigrateStep.tsx` — Run + MigrationResultView + MigrationStatusView (M1)
- `components/steps/AssetsStep.tsx` — coverage table, inline set-default picker, dev-publish, deep-link to `/assets`
- `components/steps/PublishStep.tsx` — promotion table (M1) + final summary
- `pipeline.module.css` — composes `@las-flores/ui` classes

**Tests:** `usePipeline.test.ts` (gating, hydration from mocks), `Stepper.test.tsx` (state rendering, click nav)

**Verification:**
```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
```
Manual smoke: walk `/pipeline` end-to-end.

---

### M3 — Story Bible: editable lore (M3: lore-edit) ✅ COMPLETE
**Scope:** `/lore` is editable with edit/create support via `POST /admin/lore/file`. No further server changes needed.

**Files:**
- `components/LoreEditor.tsx` — toggle MarkdownViewer / textarea, dirty-guard, save to `/admin/lore/file`
- "New lore file" form on tree panel
- Update `page.tsx` — Edit button on viewer, New button on tree

**Tests:** `LoreEditor.test.tsx` — toggle, dirty state, save correctness, error display

**Verification:**
```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
```
Manual: edit + save lore, verify on disk.

---

### M4 — AI Configuration page (M4: ai-config)
**Scope:** New `/ai-config` route + one server endpoint.

**Server** (`server/src/routes/admin-ai-config.ts`):
- `GET /admin/ai-config` returns effective LLM/plan config from env: `provider`, `baseUrl`, `apiKeyConfigured`, `apiKeyMasked`, `model`, `timeoutMs`, `maxTimeoutMs`, `outlineModel`, `outlineMaxTokens`, `outlineInitialMaxItems`, `outlineContextDepth`, `planOutlineMaxInputChars`, `planFillConcurrency`, `planFillTimeoutMs`, `priceTableConfigured`
- Secrets redacted, base URL host kept (key masked)
- Mounted at `/admin/ai-config` in index.ts

**Admin** (`admin/src/app/(admin)/ai-config/`):
- Card-grid layout with labelled values and "set via ENV_VAR" notes
- Links: PROMPT_GUIDELINES.md, asset prompt catalog, Story Builder docs

**Tests:**
- `server/tests/unit/admin-ai-config.test.ts` — shape, secrets guarded, defaults
- `admin/ai-config/__tests__/page.test.tsx` — renders config, missing-value state

**Verification:**
```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
npx --no-install jest --workspace=server --clearCache
npm run lint --workspace=server && npm run test --workspace=server && npm run build --workspace=server
./scripts/podman-workflow.sh build
./scripts/podman-workflow.sh server-test
```

---

### M5 — Nav consolidation + dashboard (M5: nav)
**Scope:** Rewrite `nav-config.ts` sidebar and update dashboard.

**Nav structure:**
```text
Authoring          Pipeline [NEW], Story Builder, Plans
Story Bible        Lore [upgraded, renamed]
Narrative          Story Arc, Stories, Story Beats, Missions,
                   Mysteries, Gigs
Dialogue           Dialogues, Overlays
World              Characters, Scenes, Locations, Maps, Vault, Shop
Tools (collapsible sub-items)
  Content Ops      YAML Editor, Validation, Migration, Diff
  Asset Ops        Asset Generation, Coverage, Promotion
  Content Linker
  Insights         Quality, Analytics
System             AI Config [NEW], Settings, Users
```

**Dashboard:** Primary CTA "Open Pipeline →"; secondary CTAs (Story Bible, Story Arc, AI Config).

**Tests:** `Sidebar.test.tsx` — new section shape, sub-item rendering.

**Verification:**
```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
```

---

### M6 — Documentation (M6: docs)
**Scope:** Update long-term references.

| Doc | Update |
|---|---|
| `ADMIN_ARCHITECTURE.md` | Add `/pipeline`, `/ai-config`; new nav map; M1 extraction table; fix stale "`/settings` is stub" claim; update verification |
| `DATA_INTAKE.md` | Pipeline as Path A UI in tables; "How the paths relate" section |
| `content/README.md` | Admin URL references (pipeline primary) |
| `AGENTS.md` | Fix admin verification if stale |

**Files touched:** 3–4 markdown files.

---

### 3. Open questions

1. **Pipeline Edit: raw text or schema-aware forms?** Raw text v1. Schema forms are a separate milestone.
2. **`/assets` pre-selection via query param.** CatalogView doesn't read URL state. Adding `?prompt_rel=<slug>` parsing is a small follow-up to M2.
3. **Tool sub-items in nav rail mode.** Generic parent icons ("Content Ops") may feel vague when collapsed. Ship as-is, adjust if it feels wrong.
4. **Doc drift: `/users` page.** The 222-line `users/page.tsx` exists — need to verify if it's still a placeholder before M6.

### 4. Commit order

```text
1. refactor(admin): extract shared editor/validation/migration/promotion components
2. feat(admin): add unified intake pipeline page
3. feat(admin): add editable story bible (lore editor)
4. feat(server): add read-only AI configuration endpoint
5. feat(admin): add AI configuration page
6. refactor(admin): reorganize nav around authoring pillars + update dashboard
7. docs: update ADMIN_ARCHITECTURE, DATA_INTAKE, content README
```

### 5. Full verification (post-all-milestones)

```bash
npm run lint --workspace=admin && npm run test --workspace=admin && npm run build --workspace=admin
npx --no-install jest --workspace=server --clearCache
npm run lint --workspace=server && npm run build --workspace=server && npm run test --workspace=server
./scripts/podman-workflow.sh build
./scripts/podman-workflow.sh server-test
```

Acceptance walk-through: Dashboard → Pipeline (edit→validate→migrate→assets→publish) → Story Bible (edit + save lore) → AI Config (values match .env) → standalone pages still work → nav sections collapse correctly.

### 6. References

- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure (M6 refreshes)
- `docs/DATA_INTAKE.md` — three intake paths (Path A = pipeline)
- `docs/STORY_BUILDER_DESIGN.md` — Story Builder design, prior milestones
- `docs/UI_STYLE_SYSTEM.md` — shared CSS contract
- `AGENTS.md` — constraints, verification, clean-shutdown pattern
