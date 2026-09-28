-- SC-S4 spike: pg_trgm vs ILIKE precision/recall over spike_trgm.corpus /
-- spike_trgm.labeled_pairs (built by sc-s4-build-corpus.mjs). Run via:
--   psql -U las_flores -d las_flores -f server/scripts/spikes/sc-s4-analysis.sql

-- Per-pair top-1 pg_trgm match, for eyeballing
SELECT
  lp.query,
  lp.expected_canonical,
  c.name AS top_match,
  round(similarity(lp.query, c.name)::numeric, 3) AS sim,
  (c.name = lp.expected_canonical) AS correct_top1
FROM spike_trgm.labeled_pairs lp
CROSS JOIN LATERAL (
  SELECT name FROM spike_trgm.corpus
  ORDER BY similarity(lp.query, name) DESC
  LIMIT 1
) c
ORDER BY lp.id;

-- Threshold sweep: recall (expected canonical appears among matches with
-- sim > T) and precision (of all matches returned across all queries at
-- that T, how many are the correct canonical).
WITH thresholds AS (
  SELECT unnest(ARRAY[0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50]) AS t
),
matches AS (
  SELECT
    th.t,
    lp.id AS pair_id,
    lp.expected_canonical,
    c.name AS matched_name,
    similarity(lp.query, c.name) AS sim
  FROM thresholds th
  CROSS JOIN spike_trgm.labeled_pairs lp
  JOIN spike_trgm.corpus c ON similarity(lp.query, c.name) > th.t
)
SELECT
  t AS threshold,
  count(*) AS total_matches_returned,
  count(*) FILTER (WHERE matched_name = expected_canonical) AS true_positives,
  count(*) FILTER (WHERE matched_name != expected_canonical) AS false_positives,
  count(DISTINCT pair_id) FILTER (WHERE matched_name = expected_canonical) AS pairs_recalled,
  (SELECT count(*) FROM spike_trgm.labeled_pairs) AS total_pairs,
  round(
    count(DISTINCT pair_id) FILTER (WHERE matched_name = expected_canonical)::numeric
    / (SELECT count(*) FROM spike_trgm.labeled_pairs), 3
  ) AS recall,
  round(
    (count(*) FILTER (WHERE matched_name = expected_canonical))::numeric
    / NULLIF(count(*), 0), 3
  ) AS precision
FROM matches
GROUP BY t
ORDER BY t;

-- ILIKE baseline: does a plain substring search (either direction) find the
-- expected canonical, and how many corpus rows does it spuriously match?
WITH ilike_matches AS (
  SELECT
    lp.id AS pair_id,
    lp.query,
    lp.expected_canonical,
    c.name AS matched_name
  FROM spike_trgm.labeled_pairs lp
  JOIN spike_trgm.corpus c
    ON c.name ILIKE '%' || lp.query || '%'
    OR lp.query ILIKE '%' || c.name || '%'
)
SELECT
  lp.id,
  lp.query,
  lp.expected_canonical,
  COALESCE(string_agg(im.matched_name, ', '), '(no match)') AS ilike_matches,
  bool_or(im.matched_name = lp.expected_canonical) AS found_expected
FROM spike_trgm.labeled_pairs lp
LEFT JOIN ilike_matches im ON im.pair_id = lp.id
GROUP BY lp.id, lp.query, lp.expected_canonical
ORDER BY lp.id;

-- ILIKE aggregate precision/recall (ILIKE has no threshold to sweep)
WITH ilike_matches AS (
  SELECT
    lp.id AS pair_id,
    lp.expected_canonical,
    c.name AS matched_name
  FROM spike_trgm.labeled_pairs lp
  JOIN spike_trgm.corpus c
    ON c.name ILIKE '%' || lp.query || '%'
    OR lp.query ILIKE '%' || c.name || '%'
)
SELECT
  count(*) AS total_matches_returned,
  count(*) FILTER (WHERE matched_name = expected_canonical) AS true_positives,
  count(*) FILTER (WHERE matched_name != expected_canonical) AS false_positives,
  count(DISTINCT pair_id) FILTER (WHERE matched_name = expected_canonical) AS pairs_recalled,
  (SELECT count(*) FROM spike_trgm.labeled_pairs) AS total_pairs,
  round(
    count(DISTINCT pair_id) FILTER (WHERE matched_name = expected_canonical)::numeric
    / (SELECT count(*) FROM spike_trgm.labeled_pairs), 3
  ) AS recall,
  round(
    (count(*) FILTER (WHERE matched_name = expected_canonical))::numeric
    / NULLIF(count(*), 0), 3
  ) AS precision
FROM ilike_matches;

-- EXPLAIN ANALYZE sample: does the GIN trigram index get used at this corpus size?
EXPLAIN ANALYZE
SELECT name FROM spike_trgm.corpus WHERE name % 'Rio Grande'
ORDER BY similarity(name, 'Rio Grande') DESC;
