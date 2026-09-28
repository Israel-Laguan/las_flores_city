# SC-S3 — Overlay view with ADD + MODIFY: do traversals differ correctly?

**Box:** 1 day · **Actual:** ~2 hours · **Date:** 2026-09-08
**Feeds:** SC-702, `plan-graph-in-postgres.md` open question #3

## Question

`plan-graph-in-postgres.md` §2 reframes the Neo4j-replacement case around overlay, not
traversal: "the hard part is overlay." §3.3 proposes the overlay as a view/CTE — canon
`LEFT JOIN plan_deltas`, `DELETE` rows filtered, `jsonb` merge (`||`, "a single operator")
for `MODIFY`. This spike hand-authors one `ADD` and one `MODIFY` delta against SC-S1's
real projected content, builds that overlay, and runs SC-S2's reachability query against
canon alone vs. canon-with-overlay to find out whether the composition actually works —
and specifically whether `jsonb` merge alone is sufficient for `MODIFY`, per open question
#3 (§11: "changed fields only, or full snapshot?").

## What was run

Script: `server/scripts/spikes/sc-s3-overlay.mjs`, built on `spike_sc_s1.entity_edges` (must be
rebuilt first — SC-S1's script drops/recreates it every run). **Now committed** — see
`server/scripts/spikes/sc-s3-overlay.mjs`. The script handles ADD and MODIFY deltas,
builds the overlay per plan-graph-in-postgres.md §3.3, and runs SC-S2's reachability query
against canon alone vs. overlay.

```bash
DATABASE_URL="postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores" \
  node server/scripts/spike_sc_s1_project_entity_edges.mjs   # rebuild canon edge table

DATABASE_URL=... node server/scripts/spikes/sc-s3-overlay.mjs  # this spike
```

### Setup

**Canon entity** captured for the merge (real shape, lifted from
`content/dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml`, node
`vq_endings_start`, trimmed to the fields projection actually reads):

```json
{
  "choices": [
    { "id": "branch_grounded", "required_flags": { "vq_gave_space": true } },
    { "id": "branch_shut_out", "required_flags": { "vq_pushed_away": true } },
    { "id": "branch_departed" },
    { "id": "branch_friends" }
  ]
}
```

**`plan_deltas`** (schema per §3.1: `plan_id, entity_type, entity_slug, op, payload,
base_hash, position`), one `ADD` + one `MODIFY`:

- **ADD** `dialogue_vq_push#vq_push_epilogue_added` — a new dialogue node, not in canon.
  Full-snapshot payload (per §3.1, "full for ADD"): sets a new flag `vq_epilogue_seen`,
  gated on `vq_gave_space` — a flag canon already sets at depth 0
  (`dialogue_vq_push#vq_push_space_end`), chosen so the ADD node should surface at depth 1
  in the overlay if composition works.
- **MODIFY** `dialogue_vq_endings#vq_endings_start` — changed-fields-only payload (per
  §3.1, "changed fields only for MODIFY"): re-gates `branch_grounded` from
  `vq_gave_space` to `vq_never_set_flag`, a flag nothing in canon ever sets.
  `branch_shut_out`/`branch_departed`/`branch_friends` are **not** in the author's intent
  and must survive untouched.

### Overlay build (§3.3)

Ran `COALESCE(canon.payload, '{}'::jsonb) || delta.payload` — the literal
`canon.payload || delta.payload` is NULL for ADD (no canon row, LEFT JOIN yields
NULL, and `NULL || jsonb` is NULL, which would drop every ADD node's edges). Then re-projected
`sets_flag`/`requires_flag` edges from the merged entity using the same projection rules
SC-S1's script used (`effects.flag_set` → `sets_flag`, `choices[].required_flags` →
`requires_flag`). Also built a second, corrected version that merges the `choices` array
element-by-element on `id` instead of letting `||` replace it wholesale, to isolate
whether the failure (see below) is inherent to `jsonb` merge or specific to this payload
shape.

Three edge tables were then run through SC-S2's exact reachability-query shape (recursive
CTE, `sets_flag`/`requires_flag`, visited-path array): `spike_sc_s1.entity_edges` (canon
alone), an overlay built from the naive `||` merge, and an overlay built from the
corrected per-field merge.

## Raw results

**Naive `||` merge** — `canon.payload || delta.payload` on the `MODIFY` entity:

```json
{"choices":[{"id":"branch_grounded","required_flags":{"vq_never_set_flag":true}}]}
```

The `choices` array was replaced wholesale — `branch_shut_out`, `branch_departed`, and
`branch_friends` are gone, even though only `branch_grounded` was in the delta's intent.
Projected `requires_flag` edges for this node dropped from 2 (canon) to 1: only
`vq_never_set_flag` survived; the `vq_pushed_away` edge from `branch_shut_out` vanished
with it.

**Corrected (per-field/array-aware) merge** — same delta, array merged by `choices[].id`:

```json
{"choices":[
  {"id":"branch_grounded","required_flags":{"vq_never_set_flag":true}},
  {"id":"branch_shut_out","required_flags":{"vq_pushed_away":true}},
  {"id":"branch_departed"},
  {"id":"branch_friends"}
]}
```

Projected `requires_flag` edges: 2, as expected — `vq_never_set_flag` (changed) and
`vq_pushed_away` (untouched, preserved).

**Reachability, all three runs** (targets tracked explicitly):

```
canon alone (174 reachable nodes)
  dialogue_vq_push#vq_push_epilogue_added: NOT reachable
  dialogue_vq_endings#vq_endings_start:    reachable, depth=1
  dialogue_vq_father#vq_father_start:      reachable, depth=1

overlay, naive merge (174 reachable nodes)
  dialogue_vq_push#vq_push_epilogue_added: reachable, depth=1
  dialogue_vq_endings#vq_endings_start:    NOT reachable      <- wrong
  dialogue_vq_father#vq_father_start:      reachable, depth=1

overlay, corrected merge (175 reachable nodes)
  dialogue_vq_push#vq_push_epilogue_added: reachable, depth=1
  dialogue_vq_endings#vq_endings_start:    reachable, depth=1
  dialogue_vq_father#vq_father_start:      reachable, depth=1

diffs vs canon:
  naive overlay:     added [vq_push_epilogue_added], removed [vq_endings_start]
  corrected overlay: added [vq_push_epilogue_added], removed []
```

The naive-merge overlay's reachable *count* (174) matches canon's by coincidence — one
node added, one wrongly dropped — which is exactly why "does it still run" is not a
sufficient check; only the per-node diff exposes the bug.

## Answer

**Yes, with a caveat that is the actual finding.**

1. **The ADD entity appears correctly, in both merge variants.**
   `dialogue_vq_push#vq_push_epilogue_added` is absent from canon-alone traversal and
   present at depth 1 in both overlay variants, exactly as expected from its
   `vq_gave_space` gate. This half of the acceptance criteria holds cleanly regardless of
   the merge question below.

2. **`jsonb` merge alone is *not* sufficient for this `MODIFY` case.** The naive `canon.payload
   || delta.payload` merge that §3.3 proposes ("a single operator") is a **shallow,
   top-level merge**: any key present in both sides is replaced wholesale, not merged
   recursively. `choices` is an array, so it got replaced in full — silently deleting
   three choices, and one requires_flag gate (`branch_shut_out` / `vq_pushed_away`), that
   the delta's author never touched. The traversal result showed this as data loss, not a
   crash: `vq_endings_start` flipped from reachable to **incorrectly unreachable**,
   because its only surviving requires_flag edge pointed at a flag nothing sets. This is
   the "differs, but not *correctly*" failure mode the acceptance criteria warned against
   distinguishing from "differs correctly."

   A **per-field, array-aware merge** (match `choices` elements by `id`, merge each
   matched pair, keep unmatched elements untouched) fixed it: `vq_endings_start` stayed
   correctly reachable via the untouched `branch_shut_out` gate, and the changed gate
   (`branch_grounded` → `vq_never_set_flag`, a never-set flag) correctly stopped
   contributing to reachability through that specific choice — the overlay's *net*
   traversal was the union of: everything canon already reached, plus the new ADD node,
   with no illegitimate removals.

## What it changes

- **Open question #3 (`plan-graph-in-postgres.md` §11) is pushed toward "full snapshot,"
  not settled but weighted.** The document frames it as "changed fields is a smaller
  diff; full snapshot is easier to validate in isolation" — a size-vs-simplicity
  trade-off. This spike adds a third axis that wasn't in the framing: **changed-fields
  payloads are only safe to merge with a single `jsonb` operator when every changed field
  is itself a scalar or an object merged by key.** The moment a changed field lives inside
  an array (here, one element of `choices` out of four), `||` cannot express "replace this
  one element, leave the rest" — it can only express "replace the whole array." Content in
  this codebase is array-heavy at exactly the granularity `MODIFY` deltas would target
  (`choices`, `effects.flag_set` sub-keys, dialogue `nodes` themselves as a keyed object
  rather than array — that one's fine since it's a plain jsonb object, not an array). Any
  `MODIFY` that touches one array element needs either (a) full-snapshot payloads for the
  containing array-bearing field, or (b) purpose-built per-field merge logic keyed by a
  stable element id. Since (b) is exactly the kind of application code the "changed
  fields" side of the trade-off was trying to avoid needing, this finding is a real weight
  on the "full snapshot" side of #3 — **for any entity type whose payload has array
  fields**, which based on SC-S1's projected shapes (`choices`, `flag_set` as an object is
  fine, but scene `available_dialogues` and mission `aftermath_payload` are arrays too)
  is most of them, not an edge case.
- **§3.3 needs a correction, not just an implementation detail.** "jsonb merge is a single
  operator" undersells the actual mechanism needed. The overlay view itself (canon `LEFT
  JOIN plan_deltas`, `DELETE` filtered) held up exactly as designed — that part of the
  spike passed without incident. The correction is scoped narrowly: the merge step inside
  that view needs to be array-aware wherever the entity schema has array fields, which
  given the point above is the common case, not the exception.
- **SC-S1's edge-projection code becomes directly reusable for this**, not just for canon.
   The same `effects.flag_set` → `sets_flag` / `choices[].required_flags` → `requires_flag`
   rules SC-S1 wrote for canon content projected correctly over the merged (canon+delta)
   payload with no changes — confirming §3.2's claim that projection is agnostic to
   whether the source is canon or an overlay. That reduces the actual implementation gap to
   "make the merge step array-aware," not "write a second projection path."
- **Implementation constraint for the overlay view.** Until a schema-owned, array-aware
   merge is implemented (per-element by stable `id`, with per-field merge semantics — not
   wholesale `||` replacement — and ordering/deletion owned by the entity schema in
   `contracts/`), `MODIFY` deltas that touch array-bearing fields MUST carry full snapshots
   for those fields. Naive partial `choices` arrays that rely on `||` WILL silently drop
   unmentioned elements and produce wrong reachability (as demonstrated above).
- **This does not reopen C1 (Overlay) in §4's capability table as a whole.** The
   view-composition mechanism (`LEFT JOIN` + filter + merge) is sound; only the *merge*
   sub-step needs to be smarter than the doc's "single operator" framing suggested. Still
   **conditionally equal or better than Neo4j's `GraphMerger` once array-aware merge is
   validated**, just not as trivially cheap to implement as §3.3 implied — budget for
   per-field/array merge logic in the entity-agnostic delta layer's implementation, not a
   schema redesign.
