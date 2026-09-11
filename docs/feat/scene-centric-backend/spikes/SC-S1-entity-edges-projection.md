# SC-S1 — Project `entity_edges` from existing content — is it natural?

**Box:** 1 day · **Actual:** ~2 hours · **Date:** 2026-09-08
**Feeds:** SC-701, SC-S2, SC-S3, SC-M5 design (`roadmap.md`)

## Question

`plan-graph-in-postgres.md` §3.2 claims edges can be *projected* from existing entity
payloads (characters, dialogue, mission, locations) rather than hand-authored, and that
this projection is what lets the new backend drop Neo4j. Nothing had actually tried it
against the real content directory. If projecting turns out to require contorting the
source payloads, §3.2's case is weaker than written and `SC-701`/`SC-S2`/`SC-S3` need to
re-plan around that, not quietly retry with a different shape.

## What was run

```
DATABASE_URL="postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores" \
  node scripts/spikes/sc-s1-project-entity-edges.mjs
```

The script (`scripts/spikes/sc-s1-project-entity-edges.mjs`, throwaway, re-runnable) walks
`content/characters` (194 files), `content/dialogues` (59 files), `content/scenes` (18
files), `content/missions` (1 file, 1 mission record) and the 13 `content/districts`
folders, projects `entity_edges` rows in memory, then loads them into a scratch schema
(`spike_sc_s1`, dropped/recreated each run — not `SC-103`'s `planning`/`runtime` schemas)
in the existing dev Postgres container (`las-flores-postgres-oltp`, host port 5434).

No fixture or synthetic data was used — every row traces to a real file under `content/`.

**Reproducibility caveat:** the script was a local throwaway and was **not committed** with
this write-up — the numbers above are not re-runnable from the repo as-is. Before any
downstream ticket (SC-701, SC-S2, SC-S3) builds on these counts, the harness must either
be committed (e.g. `server/scripts/spike_sc_s1_project_entity_edges.ts`, since `scripts/`
is reserved for file-to-file tools that never touch the DB) or re-run and re-recorded.

## Raw results

```
=== SC-S1 projection summary ===
characters: 194, dialogues: 59, scenes: 18, missions: 1, districts: 13
total edges projected: 1018
edge_kind distribution: {
  affiliated_with: 192,
  located_in: 24,
  offers_dialogue: 13,
  scene_participant: 522,
  sets_flag: 237,
  requires_flag: 28,
  gives_item: 2
}
unresolved district titles (no slug match): South Las Flores, Universidad del Valle
unresolved speaker_ids (no character match): 4

=== Postgres load result ===
row count in table: 1018
sizes: { total_size: '328 kB', table_size: '144 kB', indexes_size: '152 kB' }
edge_kind counts (from table):
  scene_participant: 522
  sets_flag: 237
  affiliated_with: 192
  requires_flag: 28
  located_in: 24
  offers_dialogue: 13
  gives_item: 2
```

Index breakdown at this volume (three indexes: `(from_type, from_slug)`,
`(to_type, to_slug)`, `(edge_kind)`): **152 kB**, larger than the 144 kB table itself —
expected at 1,018 rows, where per-index fixed overhead (b-tree metapage, alignment)
dominates actual key bytes.

### 1. Total row count

**1,018** rows, from 194 characters + 59 dialogues + 18 scenes + 1 mission.

### 2. Distinct `edge_kind` values vs. the §3.2 candidate list

Candidate list: `scene_participant`, `sets_flag`, `requires_flag`, `located_in`,
`gives_item`, `mission_scene`, `affiliated_with`, `...`

| edge_kind | In candidate list? | Count | Notes |
|---|---|---|---|
| `scene_participant` | yes | 522 | see "Answer" — repurposed from scene↔character to dialogue↔character |
| `sets_flag` | yes | 237 | natural |
| `affiliated_with` | yes | 192 | natural |
| `requires_flag` | yes | 28 | natural, but see gap below |
| `located_in` | yes | 24 | required a hand-built mapping — see "Answer" |
| `offers_dialogue` | **no** | 13 | not in the candidate list; scene → dialogue, invented to project `available_dialogues` |
| `gives_item` | yes | 2 | natural (`vault_unlock` on choices) |
| `mission_scene` | yes | **0** | **absent** — the mission payload has no scene/character/location reference to project it from |

### 3. Index size at current volume

Table: 144 kB · Indexes: 152 kB · Total: 328 kB, for 1,018 rows across 3 indexes.

### 4. Did the projection feel natural, or did it require contorting?

**It's genuinely mixed, and the split matters more than an average would.** Four of the
eight edge kinds projected cleanly with no reinterpretation; two required contortion or
invention; one candidate kind is flatly unsupported by the current data shape.

**Clean, no contortion (5 kinds, 981 of 1,018 rows — 96.4%):** [Recomputed: 192 (`affiliated_with`) + 237 (`sets_flag`) + 28 (`requires_flag`) + 2 (`gives_item`) + 522 (`scene_participant`) = 981; prior draft miscounted as 979.]
- `affiliated_with` — `character.metadata.faction` is already a bare slug
  (`van_der_meer`, `lw_group`). Direct field read, one line. 192 of 194 characters have
  it; `aria_welcome_bot` and `sofia_ramirez` don't, which is a plausible content gap, not
  a projection problem.
- `sets_flag` / `requires_flag` — dialogue node `effects.flag_set` and choice
  `required_flags` are already flag-name → value maps. Direct projection.
- `gives_item` — choice `vault_unlock` is a bare vault-item UUID. Direct projection.
- `scene_participant` (522 rows) — projected from `dialogue.speaker_id` → character.
  **Dangling-reference reconciliation:** `Raw results` reports 4 unresolved `speaker_id`
  occurrences (present in the scanned node set but with no matching character row); those
  4 are **excluded** from the 522 clean count and from the 981-row clean total above —
  522 counts only the resolved occurrences (10 distinct speakers). The table's 1,018
  stored rows likewise exclude the 4 unresolved occurrences; had they been counted as
  attempted projections, the denominator would be 1,022 and clean would be 981/1,022.
  **Shape qualification:** the source field is dialogue-scoped (`dialogue.speaker_id`),
  not scene-scoped — there is no `scene.participants` field in `content/scenes/`. The
  edge therefore lands as `dialogue → character` (one hop from the `scene → character`
  shape §3.2 names) but projects without additional invention beyond that hop; it is
  counted once, in this clean bucket, not duplicated in the contortion bucket.

**Required contortion (1 kind):**
- `located_in` (scene → district, 24 rows) — `scene.district` is a human-readable title
  (`"South Las Flores"`, `"Los Andes"`), and `content/districts/` folders are snake_case
  slugs (`south`, `los_andes`). **No declared mapping exists anywhere in content/.** The
  script hand-built a 13-entry title→slug table to bridge this, and even so two titles
  seen in scene data — `"South Las Flores"` and `"Universidad del Valle"` — have no
  matching district folder at all and were dropped rather than guessed at. This is
  exactly the kind of silent mismatch §3.2's "derived at compile time" framing assumes
  away: the derivation isn't a pure field read, it's a lookup table someone has to
  author and maintain by hand, and it can already fail on real content.

**Unsupported (1 kind):**
- `mission_scene` — **zero edges, and it isn't a threshold problem.** The single mission
  file (`content/missions/great_lithium_leak/mission_great_lithium_leak.yaml`) is 8
  lines: `id`, `title`, `description`, `status`, `written_by`, and an empty
  `aftermath_payload` stub. It contains no scene reference, no character reference, no
  location reference — only prose. Any scene/character/mission relationship that exists
  lives in the accompanying `.md`/`.prompt.md` files as narrative text, not as a
  structured payload field. There is currently nothing in the mission's *data* to derive
  `mission_scene` from — not "1 mission is too small a sample," but "the field doesn't
  exist yet."

**A structural gap the candidate list doesn't cover at all:** dialogue choices gate on
two different mechanisms — `required_flags` (flag-name → bool, maps cleanly to
`requires_flag`) and `required_relationship` (e.g. `{friendship: "gte:7"}`, a comparator
expression against a relationship-strength scalar). The candidate `edge_kind` list has no
slot for the second kind at all; this spike's script simply doesn't project it. Ten
occurrences exist in `camila_santander_endings.yaml` alone. Whatever ships needs either a
new edge kind (e.g. `requires_relationship` with an `attrs.comparator` payload) or an
explicit decision to leave relationship gates out of tier-3 checking — but the omission
needs to be a decision, not a byproduct of the candidate list happening not to mention it.

**One data-hygiene finding, unrelated to the edge shape itself:** both
`plan-graph-in-postgres.md` §10 and this ticket's own README state "25 dialogue files."
The real count in `content/dialogues/` is **59**. The corpus this spike (and any future
one) is meant to be tested against is already misdescribed in the reference docs by more
than 2×.

## Answer

**It depends, and the dependency is legible — this is not a clean yes.** Four of eight
edge kinds (96% of projected rows) are genuinely a direct field read, exactly as §3.2
describes. But `located_in` needed a hand-authored mapping table with real unresolved
cases on real content, `scene_participant` had to move one join hop from the shape §3.2
names, `mission_scene` produced zero rows because the field it would come from doesn't
exist in the mission payload yet, and dialogue's `required_relationship` gate has no
candidate edge kind to land in at all. The "drop Neo4j" case in §3.2 is not wrong, but it
currently rests on the easy 96% and is silent about the harder 4% — which happens to
include the one edge kind (`mission_scene`) that the roadmap treats as a given.

## What it changes

- **`SC-701`** — cannot assume `mission_scene` projects for free. Either the mission
  payload schema needs a structured scene/character/location field added before `SC-701`
  starts (a real scope addition, not a re-plan of existing scope), or `mission_scene`
  drops out of the tier-3 checks `SC-701` was going to build on top of it. This needs an
  explicit decision before `SC-701` is scoped, not an assumption carried in from
  `plan-graph-in-postgres.md`.
- **`SC-S2`** (reachability cost) — its recursive-CTE cost measurement should run against
  the *actual* edge_kind mix this spike produced (dominated by `scene_participant` and
  `sets_flag`, not by `located_in`/`mission_scene` traversal edges), since those are what
  exist today. If `mission_scene` gets added later, `SC-S2`'s cost numbers will need
  re-measuring — they won't transfer.
- **`SC-S3`** (overlay view) — should be built and tested against the edge_kind set that
  actually exists (`affiliated_with`, `sets_flag`, `requires_flag`, `gives_item`,
  `scene_participant`, `offers_dialogue`, `located_in`), not the full §3.2 candidate list.
  `mission_scene` overlay behavior is untestable until the schema gap above is resolved.
- **SC-M5 design (`roadmap.md`)** — "`entity_edges` projection from entity payloads" as an
  `S1` line item is more than a mechanical derivation step; it includes at least one
  hand-authored, unverified mapping table (district title → slug) that needs its own
  review and test coverage, and at least one missing edge kind
  (`requires_relationship`-equivalent) that isn't in scope yet. The exit criterion "the
  four anti-joins find at least one real problem in existing content" is unaffected by
  any of this — those anti-joins run fine against the kinds that did project — but the
  broader claim that entity_edges is "derived at compile time from entity payloads; never
  hand-authored" (§3.2's own words) needs qualifying: one edge kind's *mapping table* is
  hand-authored, even if the edges themselves are not.
- **Reference docs** — `plan-graph-in-postgres.md` §10 and this ticket's own README both
  say "25 dialogue files"; the real number is 59. Both should be corrected so the next
  person sizing work against this corpus isn't off by more than 2×.
