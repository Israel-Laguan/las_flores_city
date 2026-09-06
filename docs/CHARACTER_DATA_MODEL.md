# Character Data Model — Plan-Friendly Design for Expressivity at Scale

**Status:** Pre-milestone exploration & context document. Purpose: establish a data-model foundation that serves plan intake (M50–M53), supports the dialogue/casting systems (M54+), and enables 175+ character roster without authoring explosions.

**This is not a spec.** It's a brainstorm with schema sketches, designed to ground the next decision-making conversation. Open questions are marked with `[DECISION]`.

---

## The Current Situation

### What the pipeline already asks for

Plan intake (`StoryBuilderPlanOps.ts:499-521` `FILL_TARGETS`) sends the LLM only currently empty or TODO fields to fill for every character: up to **17 metadata fields** (`metadata.faction`, `metadata.age`, `metadata.gender`, `metadata.occupation`, `metadata.residence`, `metadata.status`, and 11 more) plus `description`, `title`, `physical_description`, `psychological_description` (21 fields total when all are empty).

### What the pipeline actually gets

| Field | Corpus population | State |
|---|---|---|
| `type` | 193/193 | **useless**: 192× `human`, 1× `ai` |
| `role` | 193/193 | **useless**: 190× `npc`, 2× `quest_giver`, 1× `guide` |
| `personality` | 192/193 | **snowflake**: 182 distinct values; top value 3×. `z.string().max(50)`, no constraints |
| `faction` | 192/193 | **half-empty**: 35 distinct values; 55 are `independent` (29% of roster) — which is not a faction, it's `NULL` masquerading |
| `occupation` | 57/193 | prose, incl. `"University Student (Urban Management), Part-time Logistics Worker"` — exactly your "student with a partial job" |
| `age` | 53/193 | mixed `45` and `"Early 20s"` in one field |
| `gender` | 47/193 | **clean**: Male / Female / Non-binary |
| `status` | 10/193 | lifecycle exists as prose with date: `"Deceased (February 2053)"` |
| `residence` | 34/193 | prose |

### The three-way drift in expressions

- **Prompt files promise ~800 variants** (196 `.prompt.md` files with "Expression Variants" sections, averaging 4–5 per file)
- **~190 exist on disk** (assets under `content/characters/*/assets/`, mostly `default`/`determined`/`happy`/`calculating`/`contemplative`)
- **10 of 195 characters expose any of them at runtime** (`portrait_urls[].expression` is populated in exactly 10 yaml files)

Nothing reconciles the three registries: `.prompt.md` is prose for humans, disk assets are generated artifacts, and `portrait_urls[]` is the runtime key. The resolver (`resolvePortraitUrl`) silently falls back to `default` for 185 characters, so the whole expression system is effectively dark in production.

### The gap for mob/generic casting

There is zero mob machinery in the codebase: no name pools, no templates, no generic NPC variant. All 195 characters are authored as `named` (lore `.md`, prompt file, asset dir) despite ~55 `independent` faction characters being ordinary life (students, vendors, homemakers, homeless). `faction` can't model ordinary life because it answers "who do you answer to" (Anarchs, LW Group, media, government), not "what is your day" (student, vendor, homeless).

---

## Proposed Schema

The model has **four layers, each serving a different query pattern:**

### Layer 1: Vocabulary Tables (Content, not Schema)

Lookup tables, not `CREATE TYPE ... AS ENUM`. They're **editable in M52's admin UI**, carry **derivation payloads** (`default_expressions`, `voice_register`), and age gracefully via `retired_at` rather than destructive deletes.

```sql
-- Closed ~16 archetypes; replaces the 182-snowflake personality slug
CREATE TABLE character_archetypes (
  id                  VARCHAR(40) PRIMARY KEY,      -- 'climber', 'fixer', 'survivor', 'operator', ...
  label               VARCHAR(80) NOT NULL UNIQUE,
  voice_register      VARCHAR(40) NOT NULL,         -- 'direct', 'evasive', 'technical', 'poetic', ...
                                                     -- ← drives dialogue tone generation at compile time
  default_expressions VARCHAR(40)[] NOT NULL,       -- ← what ends up in .prompt.md "Expression Variants"
                                                     -- e.g. ['default','determined','calculating','vulnerable','smirk']
  scene_archetypes    VARCHAR(40)[] NOT NULL DEFAULT '{}',  -- which scene archetypes match this character type
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  retired_at          TIMESTAMPTZ                    -- retire, never delete; plan validation rejects retired archetypes
);

-- Closed ~32 trait descriptors; selected per-character, never snowflakes
CREATE TABLE traits (
  id          VARCHAR(40) PRIMARY KEY,              -- 'ambitious', 'secretive', 'charming', 'ruthless', ...
  label       VARCHAR(80) NOT NULL UNIQUE,
  emoji       VARCHAR(10),                          -- optional visual tag for UIs
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  retired_at  TIMESTAMPTZ
);

-- Closed ~25 life role categories; the mob-casting workhorse
CREATE TABLE life_roles (
  id                 VARCHAR(40) PRIMARY KEY,        -- 'student', 'student_working', 'homemaker', 'homeless',
                                                      -- 'informal_vendor', 'service_worker', 'skilled_trade', ...
  label              VARCHAR(80) NOT NULL UNIQUE,
  typical_districts  UUID[],                         -- which districts see this role most; guides presence defaults
  typical_time_bands VARCHAR(20)[],                  -- ['morning','day','evening'] preferred presence
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  retired_at         TIMESTAMPTZ
);

-- Factions: affiliations only; independent → NULL
CREATE TABLE factions (
  id         VARCHAR(40) PRIMARY KEY,                -- 'lw_group', 'van_der_meer', 'media', 'government', 'criminal', ...
  label      VARCHAR(80) NOT NULL UNIQUE,
  kind       VARCHAR(20) NOT NULL,                   -- 'organization', 'family', 'gang', 'state', 'informal'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- Closes the 14-tag expression vocabulary (currently unenforced prose)
CREATE TABLE expressions (
  id          VARCHAR(40) PRIMARY KEY,               -- 'default','happy','sad','angry','surprised','shocked',
                                                      -- 'calculating','vulnerable','tender','smirk','afraid','disgusted',
                                                      -- 'determined', 'focused' (promoted from prompts)
  label       VARCHAR(80) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  retired_at  TIMESTAMPTZ
);
```

### Layer 2: Promoted Columns on `characters`

Queryable, indexed, constrained. These are **casting filters** and **generation keys**; nothing joins against them.

```sql
-- Seed sentinel before the constrained column (FK requires the row to exist):
-- INSERT INTO character_archetypes (id, label, voice_register, default_expressions) VALUES ('undefined', 'Undefined', 'direct', '{}') ON CONFLICT DO NOTHING;
ALTER TABLE characters
  -- Generation key: personality system replaces 182 snowflakes with ~16 archetypes
  -- Executable order: seed character_archetypes sentinel first, then add constrained column.
  ADD COLUMN archetype VARCHAR(40) NOT NULL DEFAULT 'undefined'
    REFERENCES character_archetypes(id) ON DELETE RESTRICT,

  -- Casting filter: "normal life" goes here instead of faction:independent
  ADD COLUMN life_role VARCHAR(40)
    REFERENCES life_roles(id) ON DELETE SET NULL,

  -- Casting filter: affiliation only; NULL = independent
  ADD COLUMN faction_id VARCHAR(40)
    REFERENCES factions(id) ON DELETE SET NULL,

  -- Casting filter: drives dialogue register and scene access
  ADD COLUMN economic_class VARCHAR(20) NOT NULL DEFAULT 'working'
    CHECK (economic_class IN ('precarious','working','comfortable','elite')),

  -- Weak generation key: can drive register variants (how a precarious character speaks vs. elite)
  -- Kept out of the main variant key to avoid combinatorial explosion
  ADD COLUMN gender VARCHAR(20),

  -- Casting filter: derived, never authored (fixed game era 2077; NOW() is not immutable for STORED)
  ADD COLUMN birth_year INTEGER,
  ADD COLUMN age_bracket VARCHAR(20)
    GENERATED ALWAYS AS (
      CASE
        WHEN birth_year IS NULL THEN 'unknown'
        WHEN 2077 - birth_year < 13 THEN 'child'
        WHEN 2077 - birth_year < 18 THEN 'adolescent'
        WHEN 2077 - birth_year < 30 THEN 'young_adult'
        WHEN 2077 - birth_year < 55 THEN 'adult'
        ELSE 'elder'
      END
    ) STORED,

  -- Casting filter: lifecycle state (the "deceased February 2053" that's currently prose)
  ADD COLUMN lifecycle VARCHAR(20) NOT NULL DEFAULT 'alive'
    CHECK (lifecycle IN ('alive','deceased','departed','unknown')),
  ADD COLUMN lifecycle_year INTEGER,  -- the "(2053)" from status prose

  -- Character taxonomy: shapes how much content investment to author
  ADD COLUMN tier VARCHAR(10) NOT NULL DEFAULT 'named'
    CHECK (tier IN ('named','generic')),

  -- [DECISION] When a character's lifecycle changes, do compiled plans stay valid?
  -- Carries graph_revision if the answer is "no, recompile on lifecycle change"
  ADD COLUMN graph_revision_invalidates_on_lifecycle BOOLEAN NOT NULL DEFAULT FALSE;

-- Casting query index: "who's alive, unattached, in this life_role, era, price tier?"
CREATE INDEX idx_characters_casting
  ON characters (tier, life_role, faction_id, age_bracket, economic_class)
  WHERE lifecycle = 'alive' AND archived_at IS NULL;

-- Archetype and traits drive generation; index for variant key lookups
CREATE INDEX idx_characters_generation
  ON characters (archetype, economic_class);
```

### Layer 3: Projections of Authored Arrays

These tables are **transactional, idempotent, append-only**. They're always rewritten wholesale (not merged) when a plan applies, because arrays are plan-atomic.

```sql
-- Traits: character_id + multiple trait_ids. Replaces the snowflake personality slug.
-- Authored as `traits: [ambitious, secretive]` in plan; flattened to join rows at apply.
CREATE TABLE character_traits (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  trait_id     VARCHAR(40) NOT NULL REFERENCES traits(id) ON DELETE RESTRICT,
  position     SMALLINT NOT NULL,                   -- array order preserved
  PRIMARY KEY (character_id, trait_id),
  UNIQUE (character_id, position)
);

-- Reconciles the three-way expression registry drift into one source of truth
-- Collects: promised (prompt file), generated (disk asset), published (runtime)
CREATE TABLE character_expressions (
  character_id  UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  expression_id VARCHAR(40) NOT NULL REFERENCES expressions(id) ON DELETE RESTRICT,
  asset_url     TEXT,                               -- NULL = promised but not generated
  published_at  TIMESTAMPTZ,                        -- NULL = generated but not yet live
  PRIMARY KEY (character_id, expression_id)
);

-- Where a body plausibly is: used for mission slot casting ("pick an NPC here at night")
-- Casting filter query: `WHERE character_id IN (...) AND district_id = ? AND time_band = ?`
CREATE TABLE character_presence (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  district_id  UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  time_band    VARCHAR(20) NOT NULL
    CHECK (time_band IN ('morning','day','evening','night')),
  confidence   SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100), -- 0–100; higher = more reliable cast
  PRIMARY KEY (character_id, district_id, time_band)
);

-- Expression set derivation: when archetype changes, regenerate what expressions should exist
CREATE INDEX idx_character_expressions_unpublished
  ON character_expressions (character_id, published_at)
  WHERE asset_url IS NOT NULL AND published_at IS NULL;  -- audit: generated but not live
```

### Layer 4: Mobs as Templates, Not Rows

A **mob is not a character row.** It's a template that instantiates a draw from a distribution at cast time. Only the **cast assignment** is persisted, not the full mob.

```sql
-- Mob templates: ~25–50 templates cover all ordinary-life casting needs
-- E.g. "street vendor", "university student", "service worker", each with precarious/working economic tiers
CREATE TABLE mob_templates (
  id                VARCHAR(40) PRIMARY KEY,
  archetype         VARCHAR(40) NOT NULL REFERENCES character_archetypes(id),
  life_role         VARCHAR(40) NOT NULL REFERENCES life_roles(id),
  economic_class    VARCHAR(20) NOT NULL,           -- template default; can be overridden per draw
  age_bracket       VARCHAR(20) NOT NULL DEFAULT 'young_adult',
  faction_id        VARCHAR(40) REFERENCES factions(id),  -- NULL for independent/civilian mobs
  name_pool_id      VARCHAR(40),                    -- ref to a name-generation pool (future work)
  portrait_pool_id  VARCHAR(40),                    -- ref to a portrait-asset collection
  default_traits    VARCHAR(40)[],                  -- traits baked into every instantiation
  presence          JSONB NOT NULL DEFAULT '{}',   -- typical_districts + typical_time_bands
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  retired_at        TIMESTAMPTZ
);

-- Cast assignment: what matters for a player save
-- "In this mission, the 'gang_miniboss' slot was filled by mob template 'ruthless_gang_underboss' with name 'Marcus'"
CREATE TABLE mission_mob_casts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id         UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  slot_id            VARCHAR(40) NOT NULL,          -- 'gang_miniboss', 'witness', etc.
  is_named           BOOLEAN NOT NULL,              -- false = mob; true = named character
  character_id       UUID REFERENCES characters(id),  -- if is_named = true
  mob_template_id    VARCHAR(40) REFERENCES mob_templates(id),  -- if is_named = false
  CONSTRAINT mission_mob_casts_target_shape CHECK (
    (is_named AND character_id IS NOT NULL AND mob_template_id IS NULL)
    OR
    (NOT is_named AND character_id IS NULL AND mob_template_id IS NOT NULL)
  )
  instantiated_name  TEXT,                          -- result of name pool draw
  instantiated_traits VARCHAR(40)[],                -- result of trait composition
  user_id            UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_id, slot_id, user_id)
);
```

---

## Dialogue Structure: Economic Zones

The three dialogue kinds have **opposite economics**. Making `kind` explicit lets each get only the machinery it needs, and gives plan intake a natural taxonomy.

```sql
ALTER TABLE dialogue_trees
  ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'social'
    CHECK (kind IN ('social','path','mission')),
  
  -- Per-node axis selection: which of the 6 relationship axes are "in play" for this node?
  -- Axes not listed collapse to default bucket for variant selection
  ADD COLUMN variant_axes VARCHAR(20)[] NOT NULL DEFAULT '{}',
  
  -- Mission dialogues are cast-neutral and get zero variants
  ADD CONSTRAINT mission_dialogues_have_no_variants
    CHECK (kind <> 'mission' OR cardinality(variant_axes) = 0);
```

### System A: Social Dialogues

| Property | Value |
|---|---|
| **Purpose** | Ambient relationship sim; player chats with NPCs |
| **Speaker** | Swappable — **mobs exclusively live here**; named characters in social mode have fewer variants |
| **Variant key** | `(relationship_bucket, archetype, time_band?)`; contextual multipliers for named, bucket-only for mobs |
| **Casting** | Mission slots filled by mobs from pools per `life_role`, `faction`, era |
| **Volume** | High |
| **Investment per node** | Low |
| **Effects** | Relationship axis deltas, flags |

**Example:** Player encounters a street vendor. The npc is drawn from `mob_templates.id='street_vendor_precarious'` (archetype: `operator`, life_role: `informal_vendor`, economic_class: `precarious`). Dialogue is keyed on the relationship bucket + `operator` archetype. Contextual variants (age, gender) are kept light here — reuse across mobs is the point.

### System B: Path Dialogues

| Property | Value |
|---|---|
| **Purpose** | Character-specific story arcs; relationship milestones, romance/rival routes |
| **Speaker** | **Named characters only** |
| **Variant key** | `(relationship_bucket, path_stage, archetype)`; full contextual treatment (gender, time, economic) |
| **Casting** | N/A — these are character-specific |
| **Volume** | Low |
| **Investment per node** | High |
| **Effects** | Status transitions, milestone flags, `last_milestone_day` updates |

**Example:** Mia's path dialogue "Ambition Collides" reaches the `ROMANTIC` status threshold. The dialogue gets full variant treatment (Mia is named, this is relationship-critical). Path milestones feed the "dating sim" output mentioned in System A.

### System C: Mission Dialogues

| Property | Value |
|---|---|
| **Purpose** | Gate hints and mystery resolution; unambiguous lore delivery |
| **Speaker** | Slot-cast (named or mob), but **content is cast-neutral** |
| **Variant key** | **None** — mission dialogue is deterministic and cast-independent |
| **Casting** | Generic slots filled by named or mob, chosen by mission template |
| **Volume** | Low |
| **Investment per node** | Exact — every word matters |
| **Effects** | Hint/mystery flags only; **never** relationship changes |

**Example:** Mission "Minibus Manifest" needs a "cartel insider" to reveal where shipments go. The slot gets cast to either a named criminal faction character or a mob drawn from `mob_templates.id='cartel_member'`. Regardless of who speaks, the hint text is identical — the player learns `hint_id`, not a paraphrase. Prose phrasing never varies, so no player can datamine the mystery by comparing variants.

**Key invariant:** The hint is a structured `hint_id`. The speaker is presentation. Never mix them — LLM personalization *presents* a hint, never *selects* one.

---

## Plan Process Integration

### What Goes Into a Plan

```yaml
characters:
  - id: mia_chen_rojas
    fields:
      archetype: climber                  # ~16-value menu; was 182 snowflakes
      traits: [ambitious, secretive]      # array, ~32 values; atomic in deltas
      life_role: influencer               # menu of ~25; new field
      faction_id: lw_group                # NULL for independent; was always-string
      economic_class: comfortable         # 4 tiers
      gender: female
      birth_year: 2058
      lifecycle: alive
      tier: named
      metadata:                           # flavor only; never a key
        mannerisms: "...careful hand movements..."
        goals: "...establish fashion empire..."
        residence: sector_norte
```

### What TODO_FIELDS.character Becomes

Today: `['description', 'metadata.personality', 'title']` and 14 more `metadata.*` fields to fill (17 metadata fields total via `StoryBuilderPlanOps.ts` `FILL_TARGETS`; only empty/TODO fields are sent).

Proposed:
```python
TODO_FIELDS['character'] = [
  'description',        # prose (unchanged)
  'title',              # display role (unchanged)
  'archetype',          # select from menu (not TODO anymore; it's a choice field)
  'life_role',          # select from menu (new)
  'birth_year',         # LLM can suggest from `description`; converted to age_bracket at apply
]
```

The prompt shifts from "fill these 19 metadata fields" to "pick an archetype and life_role for this character, then we'll derive the rest." Smaller surface, clearer choices, better plans.

### How Backfill Works (Additive, Non-Destructive)

Stage 1: Add nullable columns, keep metadata.personality reading unchanged (dual read).
```sql
SELECT archetype FROM characters WHERE id = ?
  UNION ALL
  SELECT 'undefined' WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ?)
  -- Eventually: SELECT archetype FROM characters WHERE id = ?  (only path)
```

Stage 2: Backfill mechanical rules:
- `gender`: already 47 files with M/F/NB — copy directly. LLM-fill the 146 `NULL`.
- `birth_year`: extract from `age` (53 files have numeric age) or derive from `description`.
- `archetype`: split `metadata.personality` on `_`, tag head word as archetype candidate (`ambitious` → `climber`?), prompt for review.
- `traits`: remaining words from the slug become trait candidates, backfilled to `character_traits`.
- `life_role`: derive from `occupation` (57 files), `title` (97 with commas), and `description`; prompt review.
- `lifecycle`: extract from `status` prose (10 files); LLM-infer from description for the rest.

Stage 3: Flip reads when backfill is > 95% complete. Dual-read window buys safety.

Stage 4: Archive `metadata.personality`, `metadata.status` (JSONB keys remain, but code never reads them).

### Conflict Checking

`PlanConsistencyChecker` (M50) gains new rules (all `ConsistencySeveritySchema: warning` — `attachConsistencyReport` is advisory and does not block `approveAndSolidifyPlan`; severity `reject`/`error` is not yet in the schema):

1. **Archetype retirement**: plan references a retired archetype → warning (future: `reject` severity blocks approval).
2. **Trait validity**: plan has traits not in `traits` table → warning (future: `reject` severity blocks approval).
3. **Life role + faction coherence**: some combos are invalid (e.g., `student` + `government` faction is plausible, but `homeless` + any faction is incoherent) → warning.
4. **Expression promises**: if a plan authors `character_expressions` entries, validate they match the archetype's `default_expressions` → warning.

### Graph Revision Scoping

[DECISION] If a character's `lifecycle` flips from `alive` to `deceased`, does compiled dialogue/mission content stay valid?

**Option A (preferred for now):** `lifecycle` changes are **not** graph-triggering events. A character can die in-game via narrative event, but compiled content bindings don't invalidate. (If the player unlocks "dead character" dialogue, it's authored as a separate tree with `required_relationship.lifecycle=deceased` gate.)

**Option B:** Set `graph_revision_invalidates_on_lifecycle=true` for certain characters. Changing their lifecycle bumps the tree revision, forcing recompile. Higher safety, higher cost.

---

## Gaming Structure Implications

### Expressivity at Scale

**Named characters** (55 prompts × full contextual variants × 5 relationship buckets = manageable compile-time cost):
- 16 archetypes × 2–3 traits per character × 6 expressions per archetype = unique feel per character
- Contextual variants (gender/time/economic) multiply only on the ~55 characters and ~20 "signature nodes" per character-tree
- Total compile cost is tractable

**Mob characters** (25 templates × low investment):
- Street vendor, student, homemaker, homeless, informal vendor, service worker, etc. cover ordinary life
- No contextual variants; bucket-only dialogue (same two lines all street vendors say)
- Instantiation picks a name from a pool and draws traits; cast persists only the seed
- Unmemorable by design — the point is plausibility, not personality

**Path dialogues** (one tree per named character's relationship arc):
- Full contextual treatment; every variant authored/checked
- ~55 characters × ~3–5 milestones per character × 2 variants per milestone (say, two branches at a choice point) = high quality, low volume

**Mission dialogues** (one per mission):
- Cast-neutral; no variants; deterministic hint gating
- Mystery integrity guaranteed (no variant fishing)
- Reusable across multiple slot-cast choices (bank heist works whether the inside contact is Named Character A or a mob from the criminal pool)

Total authoring load: **~55 named × 50–100 nodes each + 25 mobs × 5 nodes each + 1 mission tree × 10 nodes each.**

### Player Experience Layers

**Depth tier 1 (every player):** Relationship sim — social dialogues with a mix of named and mob characters. Generic mobs provide the plausible crowd; named characters are memorable.

**Depth tier 2 (path followers):** Character-specific story — intimate, variant-rich dialogue with named characters who have arcs.

**Depth tier 3 (mystery solvers):** Mission gating and hint gathering — unambiguous, lore-dense dialogue that never lies or varies, because hints are the thing.

The three tiers don't interfere. A player can solve mysteries without knowing any paths; a path-follower can ignore mobs. Compile-time LLM makes all three cheap to produce.

---

## Open Decisions

| Question | Implication | Timing |
|---|---|---|
| **[DECISION]** Do lifecycle changes invalidate graph revisions? | Affects whether `character_lifecycle` is a cheap denormalization or a triggering event | Before M54 scoping |
| **[DECISION]** Is economic class a weak generation key (drives register), or purely a filter? | Affects how many variants `comfortable` vs `precarious` character gets | Before M54 scoping |
| **[DECISION]** Does `character_presence` include confidence scores, or just yes/no? | Affects casting randomization (uniform vs. weighted pool); affects mission surprise mechanics | Before first mob mission |
| **[DECISION]** How many trait tags per character? (current slugs: 1–5, avg 2.5) | Affects variant multiplicity; we chose 2–3 as the sweet spot | During backfill |
| **[DECISION]** Are mobs generated on-demand (name+traits drawn at cast time) or pre-authored? | Affects authoring workload vs. instance uniqueness | Before mob casting ships |

---

## Sequencing

**Phase 1 (now, self-contained):**
- Promote `expressions` to an enum (`ExpressionSchema`), close the 14-tag vocabulary
- Reconciliation audit: compare `.prompt.md` promises vs. disk assets vs. `portrait_urls[]`

**Phase 2 (before M54, with plan intake):**
- Add nullable columns (Layer 2: `archetype`, `life_role`, `faction_id`, `economic_class`, `gender`, `birth_year`, `age_bracket`, `lifecycle`)
- Add join tables (Layer 3: `character_traits`, `character_expressions`, `character_presence`)
- Backfill mechanical rules (split personality slugs, extract gender/birth_year/lifecycle/occupation from existing data)
- Dual-read window (code reads from both Layer 2 columns and JSONB fallback)

**Phase 3 (M54, casting + path dialogue):**
- Author `character_archetypes` vocabulary (16 archetypes, voice registers, default expression sets)
- Author `traits`, `life_roles`, `factions` vocabularies
- Backfill trait split and archetype assignment; prompt review for controversial calls
- Author mob templates (25–50 templates covering ordinary life)
- Generate `.prompt.md` "Expression Variants" sections from archetype `default_expressions`

**Phase 4 (after M54):**
- Flip read path (code reads Layer 2 columns only; JSONB fallback removed)
- Archive JSONB keys (still in table, never read)
- Implement casting query filter for mission slots

---

## References

- [DIALOGUE_CACHING_AND_CHARACTER_CASTING.md](DIALOGUE_CACHING_AND_CHARACTER_CASTING.md) — System A/B dialogue and casting architecture
- `server/src/database/migrations/077_social_relationships.sql` — how the relationship grid was modeled (precedent for constrained columns vs. JSONB)
- `server/src/services/StoryBuilderPlanOps.ts:499-509` — current FILL_TARGETS (what plan intake asks for)
- `content/characters/*/char_*.yaml` — 195 real characters, corpus analysis above

