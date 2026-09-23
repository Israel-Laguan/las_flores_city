# SC-S2 — Recursive-CTE reachability cost at current and 10× volume

**Box:** 0.5 day · **Actual:** ~1.5 hours · **Date:** 2026-09-08
**Feeds:** SC-704, roadmap R13

## Question

`plan-graph-in-postgres.md` §5 claims recursive-CTE reachability over `entity_edges` is
"standard; bounded by content size" and "milliseconds at [current] scale." That line is,
per §1, "the only performance claim in the whole document set that currently has no
evidence." This spike measures it against SC-S1's real projected table instead of
asserting it.

Per SC-S1's write-up, the actual edge mix is dominated by `scene_participant` (522) and
`sets_flag` (237); `located_in` is thin (24) and `mission_scene` is absent (0). So this
spike measures reachability against the edges that actually exist and actually chain —
`sets_flag`/`requires_flag` — not the full §3.2 candidate list.

## What was run

Query (`server/scripts/spikes/sc-s2-reachability.sql`), invoked via
`server/scripts/spikes/sc-s2-run.mjs` (both now committed). **Note:** The SQL body inlined below has
been updated post-measurement to be type-aware (node_type/node_slug, from_type joins);
the EXPLAIN ANALYZE blocks below were recorded from an earlier node-level shape
(from_slug only, NO type joins). This mismatch was discovered post-SC-S3 review when the
choice-level limitation became apparent. **To reproduce the numbers below, use the node-level
SQL archived here** (earlier revision, not re-runnable from this text), or **re-run with the
type-aware SQL at `server/scripts/spikes/sc-s2-reachability.sql` and record the new numbers**
before relying on the latency baseline.

```sql
WITH RECURSIVE flag_edges AS (
  SELECT
    s.from_type AS from_type,
    s.from_slug AS from_slug,
    r.from_type AS to_type,
    r.from_slug AS to_slug,
    s.to_type   AS via_type,
    s.to_slug   AS via_slug
  FROM spike_sc_s1.entity_edges s
  JOIN spike_sc_s1.entity_edges r
    ON r.edge_kind = 'requires_flag'
   AND r.to_type = s.to_type
   AND r.to_slug = s.to_slug
  WHERE s.edge_kind = 'sets_flag'
),
reachable AS (
  -- Synthetic game-start: dialogue_node rows that SET a flag and do not REQUIRE one.
  SELECT
    s.from_type AS node_type,
    s.from_slug AS node_slug,
    ARRAY[s.from_type || ':' || s.from_slug] AS path,
    0 AS depth
  FROM spike_sc_s1.entity_edges s
  WHERE s.edge_kind = 'sets_flag'
    AND NOT EXISTS (
      SELECT 1 FROM spike_sc_s1.entity_edges r
      WHERE r.edge_kind = 'requires_flag'
        AND r.from_type = s.from_type
        AND r.from_slug = s.from_slug
    )

  UNION ALL

  SELECT
    fe.to_type,
    fe.to_slug,
    reachable.path || (fe.to_type || ':' || fe.to_slug),
    reachable.depth + 1
  FROM reachable
  JOIN flag_edges fe
    ON fe.from_type = reachable.node_type
   AND fe.from_slug = reachable.node_slug
  WHERE NOT ((fe.to_type || ':' || fe.to_slug) = ANY(reachable.path))
)
SELECT DISTINCT node_type, node_slug, min(depth) AS min_depth
FROM reachable
GROUP BY node_type, node_slug
ORDER BY min_depth, node_type, node_slug;
```

**Why this shape (and its known choice-level limitation).** There is no literal
`game_start` row anywhere in SC-S1's projected data — no edge kind for it exists.
"Game start" is modeled as the set of dialogue_node rows that *set* a flag but don't
themselves *require* one — i.e. content reachable with no prerequisite, the natural entry
points into the flag graph. `flag_edges` then links node A → node B whenever A sets a
flag that B requires (completing A "unlocks" B), and the recursive step walks that link
with a visited-path array (`ARRAY[...] `/`= ANY(...)`) for cycle safety, per §5's own
"cycles: recursive CTE with a visited-path array" note.

> **⚠ Choice-level correction (post-SC-S3 review).** `requires_flag` is projected from
> `choices[].required_flags`, but the query above stores only `from_slug` (the dialogue
> node) and its `NOT EXISTS` anti-join excludes an entire node when *any* choice on that
> node is gated — an ungated choice on the same node would be incorrectly marked
> unreachable. The fixture in `spikes/SC-S3-overlay-view.md` has exactly that shape
> (`branch_departed`/`branch_friends` ungated alongside gated `branch_grounded`).
> **Correct projection:** `requires_flag` edges MUST retain `choice_id` — e.g.
> `attrs: {choice_id, flag_slug}` — or be split into two edge kinds: `node_entry`
> (always traversable) vs `choice_requires_flag` (per-choice gate). Reachability then
> distinguishes **entering a node** (reachable if any choice that leads to it is
> enabled) from **enabling a specific choice** (requires its flag). The latency
> numbers below were measured with the node-level shape and remain valid as a
> *cost* baseline; tier-3 correctness for SC-704 MUST use the choice-aware shape
> so gated and ungated choices on the same node are not conflated. See `plan-graph-in-postgres.md` §3.2
> and `backlog.md` SC-701 for the projection fix.

Sanity-checked first: only 8 of 237 `sets_flag` flags are also referenced by a
`requires_flag` edge (`camila_romanced`, `LOVER_PATH_ACTIVE`, etc.) — a real but small
chain, consistent with SC-S1's finding that the flag-gate mechanism is present but thin
in the current corpus.

Commands:

```bash
DATABASE_URL="postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores" \
  node server/scripts/spike_sc_s1_project_entity_edges.mjs   # (re)build the 1x table

DATABASE_URL=... node server/scripts/spikes/sc-s2-run.mjs      # measure at 1x

DATABASE_URL=... node server/scripts/spikes/sc-s2-duplicate.mjs # grow to 10x, in place

DATABASE_URL=... node server/scripts/spikes/sc-s2-run.mjs      # measure at 10x
```

**Wall-clock method:** `sc-s2-run.mjs` runs the query 6 times over one open connection (1
warmup discarded, 5 timed with `process.hrtime.bigint()` around `client.query()`), and
reports min/median/max in milliseconds. This is a timed script run, not `\timing` in
psql — no `psql` client was available in this environment — but it measures the same
thing: wall-clock elapsed time for the full query round-trip, including Node↔Postgres
network overhead. That overhead is why the wall-clock numbers below run higher than
Postgres's own reported `Execution Time`.

## Raw results

### Current volume (1,018 rows)

```
=== row count in spike_sc_s1.entity_edges: 1018 ===
reachable node count: 174
=== wall-clock (ms), 1 warmup + 5 timed runs ===
min: 2.22  median: 2.88  max: 2.93
all: 2.22, 2.52, 2.88, 2.90, 2.93
```

```
=== EXPLAIN ANALYZE ===
Unique  (cost=1503.22..1504.72 rows=200 width=36) (actual time=0.608..0.626 rows=174 loops=1)
  CTE reachable
    ->  Recursive Union  (cost=26.69..1414.85 rows=3149 width=64) (actual time=0.051..0.305 rows=269 loops=1)
          ->  Hash Anti Join  (cost=26.69..51.84 rows=189 width=64) (actual time=0.051..0.111 rows=237 loops=1)
                Hash Cond: (s.from_slug = r.from_slug)
                ->  Bitmap Heap Scan on entity_edges s  (cost=5.99..26.95 rows=237 width=28) (actual time=0.024..0.038 rows=237 loops=1)
                      Recheck Cond: (edge_kind = 'sets_flag'::text)
                      Heap Blocks: exact=6
                      ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..5.93 rows=237 width=0) (actual time=0.019..0.019 rows=237 loops=1)
                            Index Cond: (edge_kind = 'sets_flag'::text)
                ->  Hash  (cost=20.35..20.35 rows=28 width=28) (actual time=0.019..0.019 rows=28 loops=1)
                      Buckets: 1024  Batches: 1  Memory Usage: 11kB
                      ->  Index Scan using entity_edges_kind_idx on entity_edges r  (cost=0.15..20.35 rows=28 width=28) (actual time=0.007..0.009 rows=28 loops=1)
                            Index Cond: (edge_kind = 'requires_flag'::text)
          ->  Hash Join  (cost=58.68..133.15 rows=296 width=64) (actual time=0.061..0.076 rows=16 loops=2)
                Hash Cond: (reachable_1.node = s_1.from_slug)
                Join Filter: (r_1.from_slug <> ALL (reachable_1.path))
                ->  WorkTable Scan on reachable reachable_1  (cost=0.00..37.80 rows=1890 width=68) (actual time=0.000..0.004 rows=134 loops=2)
                ->  Hash  (cost=57.79..57.79 rows=71 width=56) (actual time=0.105..0.106 rows=15 loops=1)
                      Buckets: 1024  Batches: 1  Memory Usage: 10kB
                      ->  Hash Join  (cost=30.65..57.79 rows=71 width=56) (actual time=0.094..0.099 rows=15 loops=1)
                            Hash Cond: ((r_1.to_type = s_1.to_type) AND (r_1.to_slug = s_1.to_slug))
                            ->  Index Scan using entity_edges_kind_idx on entity_edges r_1  (cost=0.15..20.35 rows=28 width=51) (actual time=0.006..0.008 rows=28 loops=1)
                                  Index Cond: (edge_kind = 'requires_flag'::text)
                            ->  Hash  (cost=26.95..26.95 rows=237 width=51) (actual time=0.080..0.081 rows=237 loops=1)
                                  Buckets: 1024  Batches: 1  Memory Usage: 34kB
                                  ->  Bitmap Heap Scan on entity_edges s_1  (cost=5.99..26.95 rows=237 width=51) (actual time=0.013..0.028 rows=237 loops=1)
                                        Recheck Cond: (edge_kind = 'sets_flag'::text)
                                        Heap Blocks: exact=6
                                        ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..5.93 rows=237 width=0) (actual time=0.010..0.010 rows=237 loops=1)
                                              Index Cond: (edge_kind = 'sets_flag'::text)
  ->  Sort  (cost=88.37..88.87 rows=200 width=36) (actual time=0.607..0.611 rows=174 loops=1)
        Sort Key: (min(reachable.depth)), reachable.node
        Sort Method: quicksort  Memory: 38kB
        ->  HashAggregate  (cost=78.73..80.73 rows=200 width=36) (actual time=0.463..0.473 rows=174 loops=1)
              Group Key: reachable.node
              Batches: 1  Memory Usage: 64kB
              ->  CTE Scan on reachable  (cost=0.00..62.98 rows=3149 width=36) (actual time=0.052..0.401 rows=269 loops=1)
Planning Time: 0.704 ms
Execution Time: 0.822 ms
```

### 10× volume (10,180 rows)

**How 10x was simulated — and why not naively.** `server/scripts/spikes/sc-s2-duplicate.mjs`
does *not* re-insert byte-identical rows 9 more times. A naive
`INSERT INTO ... SELECT * FROM entity_edges` would leave every `from_slug`/`to_slug`
pair unchanged across copies, which would do one of two misleading things: either
measure "scan 10x as many duplicate rows against the exact same reachability graph"
(distinct node count and fan-out don't move at all), or — worse — accidentally splice
unrelated copies together into one artificially denser, more interconnected graph
wherever the same flag name recurs across copies (e.g. every copy's `DEEPENED` flag
would now cross-link to every other copy's nodes requiring `DEEPENED`). Either distortion
would make the 10x number optimistic or nonsensical, not representative.

Instead, generations 2–10 each get a full disjoint copy: every `from_slug`/`to_slug`
value is suffixed `::genN`, so each generation is structurally identical to today's graph
(same per-node fan-out, same intra-generation flag-sharing) but shares zero edges or
flags with any other generation. This gives 10x the rows, 10x the distinct nodes, and 10x
as many disjoint reachability components — a defensible **lower bound** for "10x more
content shaped like today's."

**What this does NOT simulate, flagged explicitly:** real content growth would likely
also deepen individual chains and increase cross-references *within* a single storyline
(more flags gating more scenes off of the same earlier choices), not just multiply the
number of independent storylines. Ten disjoint copies of a shallow graph is not the same
cost profile as one graph with 10x the nodes and correspondingly longer/wider chains —
the recursive step here still only ever walks ~1-2 hops deep per component, because that's
the actual depth in today's content (see reachable node counts below: 174 at 1x, 1,740 at
10x — components scaled, chain depth did not). **If real content ever produces deep flag
chains (5+ hops), this spike's 10x number will not have exercised that path and should not
be cited as evidence it's cheap.**

```
row count after 10x duplication: 10180
```

```
=== row count in spike_sc_s1.entity_edges: 10180 ===
reachable node count: 1740
=== wall-clock (ms), 1 warmup + 5 timed runs ===
min: 10.43  median: 12.58  max: 13.87
all: 10.43, 11.00, 12.58, 13.67, 13.87
```

```
=== EXPLAIN ANALYZE ===
Unique  (cost=14982.98..14984.48 rows=200 width=36) (actual time=6.229..6.448 rows=1740 loops=1)
  CTE reachable
    ->  Recursive Union  (cost=244.52..14181.41 rows=31677 width=70) (actual time=0.156..2.300 rows=2690 loops=1)
          ->  Hash Anti Join  (cost=244.52..506.05 rows=2017 width=70) (actual time=0.156..0.741 rows=2370 loops=1)
                Hash Cond: (s.from_slug = r.from_slug)
                ->  Bitmap Heap Scan on entity_edges s  (cost=30.65..251.28 rows=2370 width=34) (actual time=0.058..0.210 rows=2370 loops=1)
                      Recheck Cond: (edge_kind = 'sets_flag'::text)
                      Heap Blocks: exact=59
                      ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..30.06 rows=2370 width=0) (actual time=0.048..0.048 rows=2370 loops=1)
                            Index Cond: (edge_kind = 'sets_flag'::text)
                ->  Hash  (cost=210.37..210.37 rows=280 width=34) (actual time=0.089..0.090 rows=280 loops=1)
                      Buckets: 1024  Batches: 1  Memory Usage: 34kB
                      ->  Bitmap Heap Scan on entity_edges r  (cost=6.46..210.37 rows=280 width=34) (actual time=0.019..0.047 rows=280 loops=1)
                            Recheck Cond: (edge_kind = 'requires_flag'::text)
                            Heap Blocks: exact=16
                            ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..6.38 rows=280 width=0) (actual time=0.014..0.014 rows=280 loops=1)
                                  Index Cond: (edge_kind = 'requires_flag'::text)
          ->  Hash Join  (cost=573.44..1335.86 rows=2966 width=70) (actual time=0.429..0.590 rows=160 loops=2)
                Hash Cond: (reachable_1.node = s_1.from_slug)
                Join Filter: (r_1.from_slug <> ALL (reachable_1.path))
                ->  WorkTable Scan on reachable reachable_1  (cost=0.00..403.40 rows=20170 width=68) (actual time=0.000..0.036 rows=1345 loops=2)
                ->  Hash  (cost=565.31..565.31 rows=651 width=68) (actual time=0.820..0.821 rows=150 loops=1)
                      Buckets: 1024  Batches: 1  Memory Usage: 29kB
                      ->  Hash Join  (cost=293.28..565.31 rows=651 width=68) (actual time=0.727..0.787 rows=150 loops=1)
                            Hash Cond: ((r_1.to_type = s_1.to_type) AND (r_1.to_slug = s_1.to_slug))
                            ->  Bitmap Heap Scan on entity_edges r_1  (cost=6.46..210.37 rows=280 width=63) (actual time=0.020..0.040 rows=280 loops=1)
                                  Recheck Cond: (edge_kind = 'requires_flag'::text)
                                  Heap Blocks: exact=16
                                  ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..6.38 rows=280 width=0) (actual time=0.014..0.014 rows=280 loops=1)
                                        Index Cond: (edge_kind = 'requires_flag'::text)
                            ->  Hash  (cost=251.28..251.28 rows=2370 width=63) (actual time=0.684..0.685 rows=2370 loops=1)
                                  Buckets: 4096  Batches: 1  Memory Usage: 310kB
                                  ->  Bitmap Heap Scan on entity_edges s_1  (cost=30.65..251.28 rows=2370 width=63) (actual time=0.040..0.213 rows=2370 loops=1)
                                        Recheck Cond: (edge_kind = 'sets_flag'::text)
                                        Heap Blocks: exact=59
                                        ->  Bitmap Index Scan on entity_edges_kind_idx  (cost=0.00..30.06 rows=2370 width=0) (actual time=0.033..0.033 rows=2370 loops=1)
                                              Index Cond: (edge_kind = 'sets_flag'::text)
  ->  Sort  (cost=801.57..802.07 rows=200 width=36) (actual time=6.227..6.265 rows=1740 loops=1)
        Sort Key: (min(reachable.depth)), reachable.node
        Sort Method: quicksort  Memory: 191kB
        ->  HashAggregate  (cost=791.92..793.92 rows=200 width=36) (actual time=3.958..4.079 rows=1740 loops=1)
              Group Key: reachable.node
              Batches: 1  Memory Usage: 385kB
              ->  CTE Scan on reachable  (cost=0.00..633.54 rows=31677 width=36) (actual time=0.158..3.223 rows=2690 loops=1)
Planning Time: 0.705 ms
Execution Time: 6.847 ms
```

## Answer

**Yes, at both current and simulated 10x volume this specific recursive-CTE shape is
milliseconds** — Postgres's own `Execution Time` goes from 0.82ms to 6.85ms (roughly
8x for 10x rows, sublinear, because the `edge_kind` index scan cost dominates and stays
cheap), and wall-clock round-trip (including client↔server overhead) goes from ~2.9ms
median to ~12.6ms median. Both are well within any reasonable request budget.

**But this is a narrower "yes" than §5's blanket claim.** It's yes *for the shallow,
mostly-disjoint chain shape that exists in today's content* (1-2 hop depth, 8 flags that
actually chain). It is not yet evidence for deep or densely cross-linked flag graphs,
because today's content doesn't have any to measure against — the 10x simulation
multiplied the number of independent shallow chains, not their depth or density. The
`Recursive Union`'s `WorkTable Scan` — the part that would blow up under deep or highly
branching recursion — stayed cheap here (WorkTable Scan rows=134/loop at 1x, 1345/loop at 10x — linear in rows, not the superlinear blow-up deep recursion would cause) specifically because
depth stayed at 1-2 hops in every generation.

## What it changes

- **R13 ("no performance goal without a baseline")** — this **partially** settles it for
  SC-M5's tier-3 traversal work, not fully. It gives R13 a real, reproducible baseline
  number (0.82ms / 6.85ms Postgres execution time at 1x/10x) instead of an unverified
  assertion, which is the concrete gap R13 flagged. But the baseline is scoped to the
  shallow chain depth in today's corpus. **R13 should be marked "baseline established for
  current content shape; re-measure if flag-chain depth grows"** — not marked fully
  closed — because a performance goal set from this number would silently assume chain
  depth stays flat, which is not something this spike tested.
- **SC-M5 tier-3 design** — the four anti-join checks (orphan flag, dead-end flag,
  unreachable scene by flag set, item/character in no scene) are all trivial anti-joins
  per §5 and untouched by this spike; the one check this spike actually speaks to —
  **reachability from game start** — is confirmed cheap at current and 10x volume,
  clearing it for SC-M5 to build on without a performance caveat blocking the design,
  *provided* the re-measure note above is tracked, not dropped.
- **SC-S3 (overlay view)** — should reuse this same query shape (recursive CTE +
  visited-path array) when testing traversal correctness under ADD/MODIFY overlays,
  since it's now a validated, working pattern rather than one that needs to be
  invented fresh.
- **Future volume growth** — if `mission_scene` or `requires_relationship` edges (both
  flagged as gaps in SC-S1) get added later, this spike's numbers do not transfer as-is:
  new edge kinds could introduce genuinely deeper or more interconnected chains than the
  `sets_flag`/`requires_flag` pair measured here, and that would need its own follow-up
  measurement, not an assumption that "SC-S2 already covered reachability cost."
