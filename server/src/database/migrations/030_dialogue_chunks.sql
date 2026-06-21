BEGIN;

-- ============================================================
-- dialogue_chunks — pre-compiled safe sub-graphs for the
-- AOT chunk compiler (Task 7.2).
--
-- Each row is a "chunk": a ≤15-node sub-graph extracted from a
-- dialogue tree at migration time. Boundary transitions (TB
-- cost, effects, conditionals, mystery solve, vault unlock,
-- relationship change, overlay gates) are recorded as "leaves"
-- rather than included as interior nodes.
--
-- Compiled idempotently: DELETE + INSERT per tree_id on every
-- migration run. No updated_at column needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS dialogue_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES dialogue_trees(id) ON DELETE CASCADE,
    chunk_key VARCHAR(100) NOT NULL,   -- the entry node id of this chunk
    nodes JSONB NOT NULL DEFAULT '{}', -- ≤15 base-tree nodes, fully resolved (no overlays)
    leaves JSONB NOT NULL DEFAULT '{}',-- boundary exits: { leafId: { type, target_chunk, ... } }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tree_id, chunk_key)
);

CREATE INDEX IF NOT EXISTS idx_dialogue_chunks_tree_id   ON dialogue_chunks(tree_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_chunks_chunk_key ON dialogue_chunks(chunk_key);

COMMIT;
