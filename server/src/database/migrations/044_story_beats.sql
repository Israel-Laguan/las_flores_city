-- Las Flores 2077 - Story Beats Registry
--
-- Establishes the story_beats table as the canonical, ordered list of
-- named story positions that all content and server logic reference by slug.
--
-- Also extends migration_log.content_type CHECK to include 'story_beat', 'story', 'mission', and 'mystery'
-- using the drop-recreate pattern from migrations 036 and 037.

BEGIN;

-- ============================================================
-- 1. Create story_beats table
-- ============================================================

CREATE TABLE IF NOT EXISTS story_beats (
    slug        VARCHAR(100) PRIMARY KEY,
    label       VARCHAR(100) NOT NULL,
    "order"     INTEGER      NOT NULL CHECK ("order" >= 0),
    description TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- 2. Unique index on order (narrative sequence must be unambiguous)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_beats_order ON story_beats("order");

-- ============================================================
-- 3. Extend migration_log.content_type CHECK to include 'story_beat'
-- ============================================================

ALTER TABLE migration_log
    DROP CONSTRAINT IF EXISTS migration_log_content_type_check;

ALTER TABLE migration_log
    ADD CONSTRAINT migration_log_content_type_check
    CHECK (content_type IN (
        'character',
        'dialogue',
        'overlay',
        'scene',
        'gig',
        'vault',
        'mystery',
        'mission',
        'shop_item',
        'location',
        'map_tile',
        'story',
        'story_beat'
    ));

COMMIT;
