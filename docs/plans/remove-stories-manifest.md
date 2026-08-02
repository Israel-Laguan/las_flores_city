# Remove the dead `stories` manifest entity (DB + admin)

> **Status**: Ready to implement
> **Scope**: `server/`, `shared/`, `admin/`, DB migration
> **Goal**: Delete the dead `stories` manifest table and every manifest-shaped code path while keeping the live beats-based story intake and the `story_beat` runtime gating fully working.

---

## 1. Background (why this is safe)

The codebase has **two unrelated things both called "story"**:

| Concept | Shape | Writes to | Runtime reads? | Verdict |
|---|---|---|---|---|
| **`story_beat`** | slug-based progression gates (`metadata.required_story_beat`, `player.story_beat`) | `story_beats` | ✅ YES — `isStoryBeatAllowed`, `resolveDialogueTree`, `location.ts` | **LOAD-BEARING — keep** |
| **`story` content type** (beats-based YAML, e.g. `content/stories/real_heroism_in_latam/real_heroism_in_latam.yaml`) | `{ id, name, description, beats: [...] }` | routes to `story_beats` via `upsertStoryBeat` | ✅ indirect (via the beats) | **ALIVE — keep the type, fix its table mapping** |
| **`stories` DB table + `YAMLStorySchema` manifest** | `{ id, title, mission_id, characters[], scenes[], dialogues[], overlays[], vault_items[] }` | `stories` | ❌ NO — zero non-admin route references it | **DEAD — remove** |

Evidence:
- `grep -rln 'stories' server/src/routes/ | grep -v admin` → **no matches** in game-facing routes. The client has no `/api/stories` route and can never query the table.
- The only real story YAML (`real_heroism_in_latam.yaml`) is **beats-based** — it would fail `YAMLStorySchema.parse` (no `title`, no `mission_id`). The intake's own `ContentSkeletonGenerator.story` template (lines 113–118) emits the beats shape, never the manifest shape.
- `useMissionGenerator`'s `createStory` branch is the **only writer** of manifest-shaped YAML, and it defaults to `createStory = true` in `useMissionForm` — so it is actively generating dead content with every mission it creates.
- The long-narrative intake (Story Builder) processes story bibles into `mission` + `story_beat` + dialogue/scene metadata and never needs the `stories` table (see `docs/DATA_INTAKE.md` §"File-driven ingestion").

---

## 2. Definitions to keep straight while implementing

- **KEEP** `story_beats` table, `StoryBeatSchema` / `StoryBeatRegistrySchema`, `isStoryBeatAllowed`, `metadata.required_story_beat` on dialogues/scenes, and the `story_beats:slugs` cache.
- **KEEP** the `story` content type in `ContentTypeSchema` and in the `migration_log` CHECK constraint. Beats-based story files under `content/stories/` still migrate as type `story` (they feed `story_beats`).
- **KEEP** `ContentSkeletonGenerator`'s `story` template (beats-based) and `LLMPromptExtractors.CONTENT_TYPES`'s `'story'` entry.
- **REMOVE** the `stories` table and everything shaped like the manifest (`YAMLStorySchema`, `upsertStory`, `/admin/stories` routes, the `data.stories` branch, the `createStory` wizard option, the Content Linker stories tab, the Story Builder `stories` context query).

## 3. DO NOT TOUCH (explicitly unrelated)

- `server/src/routes/admin-coverage*.ts` — `matchStoriesToMissions` reads `docs/lore/stories/**/*.md` (Story Bible lore coverage), **not** the `stories` table. Leave it entirely.
- `content/lore/stories/` — Story Bible world-research markdown. Unrelated to the `stories` table.
- `content/stories/real_heroism_in_latam/` — keep; it is the canonical beats-based story arc file.
- The `story_beats` registry (`content/story_beats.yaml`) and `/story-beats` admin page — load-bearing.

---

## 4. Changes

### 4.1 DB migration

**New file**: `server/src/database/migrations/058_drop_stories_table.sql`

```sql
-- Remove the dead stories manifest table.
-- A story arc is now expressed as story_beats + mission_id/story_beat metadata on
-- dialogues and scenes. Nothing at runtime reads the stories table.

-- Guard: abort if the table still holds rows that have not been archived or
-- migrated to story_beats. Only drop when empty (or already absent).
DO $$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM stories LIMIT 1) THEN
      RAISE EXCEPTION 'Refusing to drop non-empty stories table. Archive or migrate its rows to story_beats before re-running 058.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS stories;
-- (idx_stories_mission_id is dropped with the table)
```

- **Do NOT** remove `'story'` from the `migration_log` CHECK constraint — beats-based story arc files still migrate as content type `story`.
- The migration aborts (via the `DO` block above) if `stories` still contains rows — archive or migrate them to `story_beats` first. When the table is empty (or already absent) it is dropped safely.
- Apply with `./scripts/apply-migrations.sh both`. Verify with `\dt stories` (should not exist).

### 4.2 Shared schemas (`shared/`)

- `shared/src/schemas/story.ts` — **replace the manifest schema with a beats-based story-arc schema** matching the real file shape:
  ```ts
  import { z } from 'zod';
  import { zodUuid } from './uuid.js';

  export const StoryBeatEntrySchema = z.object({
    slug: z.string().min(1),
    label: z.string().min(1),
    order: z.number().int().nonnegative(),
    description: z.string().min(1),
  });

  export const YAMLStoryArcSchema = z.object({
    id: zodUuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    beats: z.array(StoryBeatEntrySchema),
  });

  // The canonical story file uses the root-level shape directly (no `story:`
  // wrapper), so the file schema validates the same shape as the arc schema.
  export const YAMLStoryArcFileSchema = YAMLStoryArcSchema;

  export type YAMLStoryArc = z.infer<typeof YAMLStoryArcSchema>;
  ```
  (The shipped implementation keeps `story.ts` and parses the complete file through `YAMLStoryArcFileSchema.parse(data)` in `validate-types.ts` — no manual beats validation — matching the `real_heroism_in_latam.yaml` shape.)
- `shared/src/index.ts` (~lines 160–161) — replace the `YAMLStorySchema` / `YAMLStoryFileSchema` exports with the new arc schema exports.
- `shared/src/schemas/content-validation.ts` — **keep `'story'`** in `ContentTypeSchema`.

### 4.3 Server content pipeline (`server/src/content/`)

- **`content-upserts.ts`** — remove the `upsertStory()` function (~line 188) entirely.
- **`upsert.ts`**:
  - Remove `YAMLStorySchema` from the `@las-flores/shared` import (line 4).
  - `processStoryData()` (~lines 84–105): **keep only the beats branch** (`if (data.beats) { ... upsertStoryBeat ... }`); delete the `const stories = data.stories || [data]; ... YAMLStorySchema.parse ... upsertStory(...)` fallback.
- **`validate-types.ts`**:
  - Remove `YAMLStoryFileSchema` from the import (line 11).
  - `case 'story'` (~lines 88–120): delete the `if (data.stories) { YAMLStoryFileSchema.parse(data) }` and the final `else { YAMLStoryFileSchema.parse(data) }` branches; **replace the manual `else if (data.beats)` validation with `YAMLStoryArcFileSchema.parse(data)`** (parses the complete arc).
- **`path-utils.ts`** — `extractContentIds` `case 'story'` (lines 7–8): change to return **beat slugs** for beats-shaped files (mirror the `story_beat` case at lines 15–24):
  ```ts
  case 'story':
    if (data.beats) {
      return (data.beats as Array<{ slug: string }>).map((item) => item.slug);
    }
    return (data as { id?: string }).id ? [(data as { id: string }).id] : [];
  ```
  Rationale: the migration drift check (`isTargetContentPresent`) must verify the actual rows written — beats → `story_beats.slug`, not the arc UUID.

- **`migrate.ts`**:
  - `CONTENT_TYPE_TABLE` (line 25): change `story: 'stories'` → `story: 'story_beats'`.
  - `isTargetContentPresent()` (~lines 56–66): add a `story` special case that behaves exactly like the `story_beat` case (slug query against `story_beats`), since beats-based story arcs write slug rows.
- **`quality.ts`** — `extractItems` (line 62): remove `'stories'` from the array-key list.

### 4.4 Server services (Story Builder context)

- **`services/ContentPlanService.ts`** — `gatherContext()` (line ~330): remove the `queryOLTP(... 'SELECT id, title FROM stories ...')` call and drop it from the `Promise.all` tuple.
- **`services/types/LLMTypes.ts`** — `ExistingContentContext` (line 18): remove the `stories` field.
- **`services/LLMPrompts.ts`** — remove the `stories:` lines (~18 and ~114) from the prompt builders.
- **`services/PlanVerificationService.ts`** (~lines 184–187) — optional: remove the `if (item.type === 'story') { mission_id ... }` block (beats-arc items have no `mission_id`; harmless but dead).

### 4.5 Server routes

- **`routes/admin-list-views.ts`** — remove the `Stories` section (~lines 388–416): `GET /stories` and `GET /stories/:id`.
- **`routes/admin-content-resolver.ts`** (line 55) — change the `story` entry to `{ roots: ['stories'] }` (drop `idArrays: ['stories']` — beats-based story files carry a top-level `id`).
- **`routes/admin-story-builder-*.ts`** — no changes expected (Story Builder works with the beats-based story items). Verify no import of `YAMLStorySchema`.

### 4.6 Admin UI (`admin/`)

- **`src/components/nav-config.ts`** — remove `{ href: '/stories', label: 'Stories', icon: 'book' }` from the `Narrative` section (line 46).
- **Delete** `src/app/(admin)/stories/` (the whole folder: `page.tsx` + `[id]/`).
- **`src/app/(admin)/content-linker/page.tsx`** — remove the `'stories'` tab:
  - `type Tab = 'scenes' | 'missions' | 'stories' | 'characters'` → drop `'stories'`
  - `TAB_CONFIG` `stories` entry (~lines 34–48)
  - `VALID_TABS` (line 118)
  - `needsContentPath` logic (lines ~132, ~153) — drop the `tab === 'stories'` conditions
- **`src/app/(admin)/missions/new/hooks/`** — remove the dormant `createStory` manifest generation:
  - `useMissionForm.ts` — remove `createStory`, `storyTitle`, `storyDescription`, `storyLoreRef` state + setters + reset + the spread in the returned object
  - `useMissionWizard.ts` — remove those fields from the `handleGenerate` config
  - `useMissionGenerator.ts` — remove the fields from the `config` type and delete the `if (config.createStory) { ... }` block (lines ~76–82) that writes `stories:` manifest YAML

### 4.7 Tests

- **`server/tests/unit/contentPlanService.test.ts`** — line 100 comment (`6 DB queries`) → 5; remove the `.mockResolvedValueOnce({ rows: [] } as any) // stories` at line ~253.
- **`server/tests/unit/asset-needs.test.ts`** — line 36: remove `'story'` from `typesWithoutAssets`.
- **`server/tests/integration/migration.drift.test.ts`** — **no change**; `'story'` stays in the CHECK enumeration (beats-based story files still migrate as type `story`).
- **`admin/src/components/__tests__/Sidebar.test.tsx`** — no change (the `Stories` link is not asserted).
- Add an integration/unit assertion (if practical) that migrating `content/stories/real_heroism_in_latam/real_heroism_in_latam.yaml` still populates `story_beats` rows (e.g. `beat_sofia_intro`) and that `\dt stories` no longer exists.

---

## 5. Verification checklist

```bash
# shared builds/tests
npm run build --workspace=shared && npm run test --workspace=shared

# server lint/build/tests
npm run lint --workspace=server
npm run build --workspace=server
npm run test --workspace=server          # or targeted suites (contentPlanService, asset-needs, migration.drift)

# admin lint/build/tests
npm run lint --workspace=admin
npm run build --workspace=admin
npm run test --workspace=admin           # Sidebar, content-linker, missions wizard tests

# DB
./scripts/apply-migrations.sh both       # 058 drops stories
# \dt stories → must not exist
# SELECT count(*) FROM story_beats WHERE slug IN ('beat_sofia_intro', 'beat_sofia_resolution'); → > 0

# After server code changes, rebuild + health-check from inside the container:
docker compose build server && docker compose up -d server
docker exec las-flores-server wget -qO- http://localhost:3000/health   # {"success":true}

# Full content migration still works:
#   POST /admin/migration (or run migrateContent) → no errors, story arcs → story_beats
```

## 6. Definition of done

1. `stories` table gone (`058` migration), no code references `FROM stories` / `INTO stories` / `YAMLStorySchema` anywhere.
2. `/admin/stories` removed; sidebar no longer shows a `Stories` link; Content Linker has no `stories` tab; the missions wizard no longer offers/creates manifest story YAML.
3. `content/stories/real_heroism_in_latam/real_heroism_in_latam.yaml` still migrates and its `beat_sofia_*` slugs land in `story_beats`.
4. `story_beat` runtime gating (`isStoryBeatAllowed`, `required_story_beat`) untouched and passing tests.
5. All lint/build/test suites green. Always clear the stale Jest cache before the server suite, then rerun normally: `npx --no-install jest --workspace=server --clearCache`.


