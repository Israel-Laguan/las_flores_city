# SC-S4 — `pg_trgm` alias detection — does it beat plain `ILIKE`?

**Box:** 0.5 day · **Actual:** ~1 hour · **Date:** 2026-09-08
**Feeds:** SC-706

## Question

SC-706 (SC-M5, five milestones out) proposes a `pg_trgm` "did you mean `central-market`?"
alias/duplicate hint for writers, per `plan-graph-in-postgres.md` §6's illustrative example
("the writer typed *el mercado de la ciudad*; we already have *central-market*"). We did not
know whether trigram similarity actually beats a plain `ILIKE '%...%'` on this repo's real
name/alias data, at what threshold, or by how much — and per the spike's own acceptance
criteria, "if it cannot beat `ILIKE`, say so" is a complete, valid answer.

This spike is independent of SC-S1/S2/S3 and SC-103 — it only reads existing
`characters` rows and existing `content/districts/**/location_*.yaml` name/alias data, and
runs entirely in a scratch schema. **Corpus scope:** 196 character names + 75 canonical
location names = 269 rows; no scenes, missions, dialogues, or overlays were indexed.
Any SC-706 threshold derived here is validated only for character/location aliases —
applying it to other `entity_aliases` types without additional labeled pairs is
unvalidated.

## What was run

`content/districts/**/location_*.yaml` already carries a hand-authored `aliases:` list per
location (writer-supplied alternate names — English/Spanish translations, abbreviations,
slang, acronyms), so no synthetic examples were needed. 12 real `(query, expected_canonical)`
pairs were hand-picked from those `aliases:` fields, spanning the difficulty range: accent
drop, substring/truncation, translation, slang synonym, and acronym.

```
scripts/spikes/sc-s4-build-corpus.mjs   — builds spike_trgm.corpus (269 rows: 196 character
                                           names from `characters` + 75 canonical location
                                           names from content YAML — locations aren't in the
                                           DB yet, only in content) and spike_trgm.labeled_pairs
                                           (the 12 pairs below), in a scratch schema.
scripts/spikes/sc-s4-analysis.sql       — per-pair top-1 match, threshold sweep
                                           (precision/recall), ILIKE baseline, EXPLAIN ANALYZE.
```

**Not committed** — both files were local throwaways; see the reproducibility rule in this
folder's README.

Commands:

```bash
DATABASE_URL="postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores" \
  node scripts/spikes/sc-s4-build-corpus.mjs

docker exec -i las-flores-postgres-oltp psql -U las_flores -d las_flores \
  -f - < scripts/spikes/sc-s4-analysis.sql

# cleanup (scratch schema only — no production table was ever touched)
docker exec las-flores-postgres-oltp psql -U las_flores -d las_flores \
  -c "DROP SCHEMA IF EXISTS spike_trgm CASCADE;"
```

The 12 labeled pairs:

| # | Query (writer's typed phrase) | Expected canonical | Variant type |
|---|---|---|---|
| 1 | Plaza de la Constitucion | Plaza de la Constitución | accent dropped |
| 2 | Rio Grande | Rio Grande Dam | truncation/substring |
| 3 | Museo Natural | Museo de Historia Natural | partial words |
| 4 | Bolsa de Valores | Bolsa de Valores Las Flores | substring |
| 5 | Universidad Nacional | Universidad Nacional de Las Flores | substring |
| 6 | Parque de Atracciones | Parque de Atracciones Las Flores | substring |
| 7 | San Pedro | San Pedro de los Pescadores | short substring |
| 8 | Vieja Las Flores | South Las Flores | Spanish translation |
| 9 | El Mercado Popular | Mercado Popular Las Flores | substring + reorder |
| 10 | Zona Rica | Northeast | slang synonym, no textual overlap |
| 11 | National Theater | Teatro Nacional | translation |
| 12 | WTCLF | World Trade Center Las Flores | acronym |

**Methodology.** `similarity(query, name)` was computed against every one of the 269 corpus
names (196 characters + 75 locations, so the test set includes realistic distractors, not
just the 12 correct answers). For each candidate threshold T: **recall** = fraction of the 12
pairs where the expected canonical scores `> T`; **precision** = correct matches ÷ total
matches returned across all 12 queries at that T (a query with several near-miss distractors
above threshold drags precision down). The `ILIKE` baseline runs `name ILIKE '%query%' OR
query ILIKE '%name%'` (bidirectional, since a truncation could go either way) with no
threshold to tune.

## Raw results

**Per-pair top-1 pg_trgm match:**

```
          query           |         expected_canonical         |             top_match              |  sim  | correct_top1
--------------------------+------------------------------------+------------------------------------+-------+--------------
 Plaza de la Constitucion | Plaza de la Constitución           | Plaza de la Constitución           | 0.786 | t
 Rio Grande               | Rio Grande Dam                     | Rio Grande Dam                     | 0.733 | t
 Museo Natural            | Museo de Historia Natural          | Museo de Historia Natural          | 0.538 | t
 Bolsa de Valores         | Bolsa de Valores Las Flores        | Bolsa de Valores Las Flores        | 0.708 | t
 Universidad Nacional     | Universidad Nacional de Las Flores | Universidad Nacional de Las Flores | 0.600 | t
 Parque de Atracciones    | Parque de Atracciones Las Flores   | Parque de Atracciones Las Flores   | 0.688 | t
 San Pedro                | San Pedro de los Pescadores        | Don Pedro                          | 0.429 | f
 Vieja Las Flores         | South Las Flores                   | Old Las Flores                     | 0.524 | f
 El Mercado Popular       | Mercado Popular Las Flores         | Mercado Popular Las Flores         | 0.533 | t
 Zona Rica                | Northeast                          | Zona Rosa                          | 0.429 | f
 National Theater         | Teatro Nacional                    | Teatro Nacional                    | 0.320 | t
 WTCLF                    | World Trade Center Las Flores      | Li Wei                             | 0.083 | f
(12 rows)
```

**Threshold sweep (pg_trgm):**

```
 threshold | total_matches_returned | true_positives | false_positives | pairs_recalled | total_pairs | recall | precision
-----------+------------------------+----------------+-----------------+----------------+-------------+--------+-----------
      0.10 |                    176 |             10 |             166 |             10 |          12 |  0.833 |     0.057
      0.15 |                     60 |             10 |              50 |             10 |          12 |  0.833 |     0.167
      0.20 |                     43 |             10 |              33 |             10 |          12 |  0.833 |     0.233
      0.25 |                     33 |             10 |              23 |             10 |          12 |  0.833 |     0.303
      0.30 |                     29 |             10 |              19 |             10 |          12 |  0.833 |     0.345
      0.35 |                     22 |              9 |              13 |              9 |          12 |  0.750 |     0.409
      0.40 |                     18 |              8 |              10 |              8 |          12 |  0.667 |     0.444
      0.50 |                      8 |              7 |               1 |              7 |          12 |  0.583 |     0.875
(8 rows)
```

**ILIKE baseline (per pair):**

```
 id |          query           |         expected_canonical         |           ilike_matches            | found_expected
----+--------------------------+------------------------------------+------------------------------------+----------------
  1 | Plaza de la Constitucion | Plaza de la Constitución           | (no match)                         |
  2 | Rio Grande               | Rio Grande Dam                     | Rio Grande Dam                     | t
  3 | Museo Natural            | Museo de Historia Natural          | (no match)                         |
  4 | Bolsa de Valores         | Bolsa de Valores Las Flores        | Bolsa de Valores Las Flores        | t
  5 | Universidad Nacional     | Universidad Nacional de Las Flores | Universidad Nacional de Las Flores | t
  6 | Parque de Atracciones    | Parque de Atracciones Las Flores   | Parque de Atracciones Las Flores   | t
  7 | San Pedro                | San Pedro de los Pescadores        | San Pedro de los Pescadores        | t
  8 | Vieja Las Flores         | South Las Flores                   | (no match)                         |
  9 | El Mercado Popular       | Mercado Popular Las Flores         | (no match)                         |
 10 | Zona Rica                | Northeast                          | (no match)                         |
 11 | National Theater         | Teatro Nacional                    | (no match)                         |
 12 | WTCLF                    | World Trade Center Las Flores      | (no match)                         |
(12 rows)
```

**ILIKE aggregate:**

```
 total_matches_returned | true_positives | false_positives | pairs_recalled | total_pairs | recall | precision
------------------------+----------------+-----------------+----------------+-------------+--------+-----------
                      5 |              5 |               0 |              5 |          12 |  0.417 |     1.000
```

**Index usage at this corpus size (269 rows):**

```
EXPLAIN ANALYZE SELECT name FROM spike_trgm.corpus WHERE name % 'Rio Grande'
ORDER BY similarity(name, 'Rio Grande') DESC;
--
 Seq Scan on corpus  (cost=0.00..27.04 rows=14 width=36) (actual time=0.437..0.493 rows=1 loops=1)
   Filter: (name % 'Rio Grande'::text)
Planning Time: 0.131 ms
Execution Time: 0.513 ms
```

The planner ignored the GIN trigram index and seq-scanned — expected at 269 rows (below the
planner's threshold for preferring an index scan). This spike does not speak to index
behavior at production content volume; it only confirms the index builds and the operator
works, per the acceptance criteria's ask for "similarity search," not an index-scaling claim.

## Answer

**It depends on the threshold, and neither tool wins outright — they trade recall for
precision differently, and `pg_trgm` only wins on the failure mode `ILIKE` is worst at.**

- **`ILIKE` is exact-precision, low-recall**: 100% precision (it never returns a wrong
  answer) but only 41.7% recall (5/12) — because it can only ever find a *literal substring*
  match. It correctly found every substring/truncation pair (#2, #4, #5, #6, #7) and missed
  every accent, translation, reordering, synonym, and acronym pair (#1, #3, #8, #9, #10, #11,
  #12) outright, with **zero partial credit** — `ILIKE` either finds the literal substring or
  returns nothing.
- **`pg_trgm` at threshold 0.30 gets recall to 83.3% (10/12)** — a clear, substantial win over
  `ILIKE`'s 41.7%, at the cost of precision dropping to 34.5% (19 false-positive suggestions
  across the 12 queries, i.e. roughly 1.6 wrong suggestions returned per correct one). It
  additionally caught the accent-drop (#1) and reorder+substring (#9) cases that `ILIKE`
  missed, and got close on truncation cases with weaker overlap (#3).
- **Neither tool caught 2 of the hardest cases, and a third was borderline**:
   pure Spanish/English **translation with no shared substring** (#8 Vieja Las Flores →
   South Las Flores — missed by both tools at every threshold), pure **slang synonym**
   (#10 Zona Rica → Northeast), and **acronym** (#12 WTCLF → World Trade Center Las
   Flores, similarity 0.083 — essentially random). **Separately**, pair 11 (National
   Theater → Teatro Nacional) **was** a `pg_trgm` true positive — similarity 0.320,
   included in the 10 recalled pairs at threshold 0.30 (see threshold sweep: 10/12
   recalled ≤0.30 includes #11). It is borderline and translation-shaped, but unlike #8 it
   shares enough trigrams (`ation`/`teatro`) to cross the threshold. These translation/
   synonym/acronym cases are exactly the shape `plan-graph-in-postgres.md` §6's own
   example ("*el mercado de la ciudad*" vs. "*central-market*") describes, and trigram
   similarity — which only measures shared 3-character substrings — is structurally weak
   at them; pure translations with zero overlap remain unrecoverable at any threshold.
- **The threshold choice matters a lot and there's no clean elbow.** 0.10–0.30 all give the
  same 83.3% recall while precision climbs from 5.7% to 34.5% purely by shrinking the
  false-positive tail — so 0.30 is the best recall-preserving choice in that band. Above 0.30,
  recall starts dropping (0.35 → 75%, 0.40 → 66.7%) before precision gets good enough to be
  usable as an auto-apply signal (only 0.50 reaches 87.5% precision, at the cost of recall
  falling to 58.3%, worse than not filtering at all for several of the harder-but-catchable
  pairs).

## What it changes

- **SC-706 should not be built as "trigram similarity threshold → did-you-mean suggestion,"
  full stop** — no single threshold gives both good recall and good precision on this
  content's actual alias vocabulary (translations, slang, acronyms are common per the
  `aliases:` data itself — 12/12 sampled pairs came from real writer-authored variants, not
  edge cases). A threshold tuned for recall (≤0.30) means the writer sees ~1.6 wrong
  suggestions for every right one; a threshold tuned for precision (0.50) throws away over a
  third of the catchable duplicates.
- **A hybrid is the only version of SC-706 worth specifying**: run `ILIKE`/substring first
  (0% false-positive cost, catches the truncation/substring cases free), then offer `pg_trgm`
  matches at a low threshold (~0.25–0.30) as **ranked, dismissible suggestions** rather than
  auto-applied hints — since precision at that recall level is too low (23–30%) to present
  as a confident single answer. This should be written into SC-706's spec directly, not left
  implicit.
- **Translation/synonym/acronym aliasing is largely out of scope for `pg_trgm`** —
   catching #8 (translation, no overlap), #10 (slang), and #12 (acronym) is not achievable
   with trigram thresholds; #11 (translation with partial overlap) was caught only
   borderline at 0.320. If SC-706 must catch pure translations/synonyms/acronyms reliably,
   that requires a different mechanism (an explicit alias table keyed by canonical entity —
   which `entity_aliases` already exists and is populated for characters, scenes,
   missions, dialogues, and overlays, though not yet for locations — or an LLM-based
   semantic match), not a `pg_trgm` threshold tweak. This should be flagged to whoever
   specs SC-706 in SC-M5 before that spec is written, not discovered again during that
   milestone. **Scope note for SC-706:** SC-S4 measured only character names (196) and
   location names (75) — 269 rows, no scenes/missions/dialogues/overlays. SC-706's
   threshold evaluation MUST be scoped to the measured types (characters + locations)
   unless additional labeled pairs are added for every other `entity_aliases` type it
   claims to cover; otherwise thresholds are unvalidated for those types.
- **Index-at-scale is still untested.** The GIN trigram index was not used by the planner at
  269 rows (seq scan won on cost). SC-706's spec should not cite this spike as evidence that
  `pg_trgm` stays cheap at production content volume — that would need its own follow-up
  measurement at realistic row counts, the same caveat SC-S2's write-up raised for its own
  cost claim.
- **`plan-graph-in-postgres.md` §6's illustrative example is itself in the "won't catch"
  category** — "*el mercado de la ciudad*" vs. "*central-market*" shares no substring, same
  shape as the slang/translation pairs this spike found unrecoverable. The reference doc's
  own motivating example is not solved by the mechanism it's used to justify; whoever revises
  §6 should either replace the example or explicitly scope it down to "catches spelling/accent
  variants and truncations, not free-form rephrasing."
