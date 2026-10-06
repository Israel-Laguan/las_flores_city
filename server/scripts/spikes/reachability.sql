-- SC-S2: recursive-CTE reachability from a synthetic game-start point,
-- over the sets_flag/requires_flag edges in spike_sc_s1.entity_edges.
--
-- There is no literal "game_start" row in the projected data (SC-S1 didn't
-- project one), so "game start" is modeled as the set of dialogue_node rows
-- that set a flag but themselves require none — i.e. content reachable with
-- no prerequisite. From there, flag_edges links node A -> node B whenever A
-- sets a flag that B requires (A "unlocks" B), and the recursive step walks
-- that link, carrying a visited-path array to stay cycle-safe.

WITH RECURSIVE flag_edges AS (
  SELECT
    s.from_slug AS from_node,
    r.from_slug AS to_node,
    s.to_slug   AS via_flag
  FROM spike_sc_s1.entity_edges s
  JOIN spike_sc_s1.entity_edges r
    ON r.edge_kind = 'requires_flag'
   AND r.to_type = s.to_type
   AND r.to_slug = s.to_slug
  WHERE s.edge_kind = 'sets_flag'
),
reachable AS (
  SELECT
    s.from_slug AS node,
    ARRAY[s.from_slug] AS path,
    0 AS depth
  FROM spike_sc_s1.entity_edges s
  WHERE s.edge_kind = 'sets_flag'
    AND NOT EXISTS (
      SELECT 1 FROM spike_sc_s1.entity_edges r
      WHERE r.edge_kind = 'requires_flag' AND r.from_slug = s.from_slug
    )

  UNION ALL

  SELECT
    fe.to_node,
    reachable.path || fe.to_node,
    reachable.depth + 1
  FROM reachable
  JOIN flag_edges fe ON fe.from_node = reachable.node
  WHERE NOT (fe.to_node = ANY(reachable.path))
)
SELECT DISTINCT node, min(depth) AS min_depth
FROM reachable
GROUP BY node
ORDER BY min_depth, node;
