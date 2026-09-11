# SC-S4 · `pg_trgm` alias detection

**Time-box:** 0.5 day · **Type:** spike · **Feeds:** SC-706

## Context

Enable `pg_trgm`, index existing location and character names, test against known
duplicate phrasings (e.g. Spanish-language variants of existing slugs).

## Dependencies

- **None.** This spike is fully independent of SC-S1/S2/S3 and of SC-103's schemas — it
  operates on existing character/location name data already in the DB. It can run at any
  point in the sprint, including in parallel with the S1→S2 chain.
- **First to cut** if capacity runs short (`sprint-01.md` §5) — it feeds SC-706, which is
  five milestones out (SC-M5). Schedule it last among the spikes precisely because it's
  both independent and lowest-urgency.

## Acceptance criteria (from the write-up)

The answer must state:
- Precision/recall on a hand-labelled set of **at least 10** known near-duplicates (real
  examples from existing content — e.g. Spanish-language variants of existing slugs, per
  `plan-graph-in-postgres.md` §6's "el mercado de la ciudad" vs. "central-market").
- The similarity threshold used.
- **Candidate universe for precision:** recall is measured against the ≥10 hand-labelled
  pairs (known positives), but **precision MUST be measured over the full indexed corpus**
  — i.e. for each query, search the entire indexed name corpus, label **every returned
  candidate** as true-positive (genuinely near-duplicate of the query) or false-positive,
  and compute `precision = true_positives / total_returned`. Pre-selected negative pairs
  are not required when this universe and labelling rule are explicit; false positives
  MUST be included in the precision denominator so the result is reproducible.

**If it cannot beat a plain `ILIKE`, say so** — then SC-706 is not worth building as
specced, and that's a valid, complete answer to this spike, not a failure of it.

Write the result to `../../spikes/SC-S4-pg-trgm-alias-detection.md` using the
`spikes/README.md` template, including the "what it changes" section.

## Prompt to execute

```
Enable pg_trgm (Postgres contrib extension, no pipeline) in a scratch/dev database,
index existing character and location names from this repo's content, and test
similarity search against a hand-labelled set of at least 10 known near-duplicate
name pairs.

This spike is independent of SC-S1/S2/S3 and SC-103 — it only needs existing
character/location name data (read content/ or the existing DB tables that hold them)
and does not require the new planning/runtime schemas.

Steps:
1. `CREATE EXTENSION pg_trgm;` in a scratch schema/DB — do not touch production data.
2. Build a trigram index (GIN or GiST) over existing character and location name/alias
   columns.
3. Hand-label at least 10 real near-duplicate pairs from this repo's actual content
   (e.g. Spanish-language phrasing variants of existing location/character slugs — look
   for these in content/ rather than inventing synthetic examples).
4. Run pg_trgm similarity search against those pairs at a few candidate thresholds;
   report precision/recall for the threshold you settle on, and state which threshold
   that is.
5. As a comparison baseline, run the same 10+ pairs through a plain ILIKE '%...%' query
   and report whether pg_trgm actually beats it. If it does not clearly beat ILIKE, say
   so plainly as the headline finding — this is a complete, useful answer, not a failed
   spike, and it means SC-706 (pg_trgm alias/duplicate hint, SC-M5) should not be built
   as currently specced.

Write the full result, including a "what it changes" section addressing SC-706's
viability, into docs/feat/scene-centric-backend/spikes/SC-S4-pg-trgm-alias-detection.md,
following the template in docs/feat/scene-centric-backend/spikes/README.md.
```
