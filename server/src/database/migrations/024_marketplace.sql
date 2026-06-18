-- Las Flores 2077 - Marketplace: Shop Items, Player Inventory, Equipped Cosmetics
-- Task 4.3 (PayPal, Gold Creds, & The "MyMe" Marketplace)
--
-- This migration runs on the OLTP database and creates:
--   1. shop_items (the catalog: cosmetics sold for credits or gold_credits)
--   2. player_inventory (the ownership ledger: which user owns which item)
--   3. Adds equipped_theme_id / equipped_border_id FK columns on public_profiles
--      (FKs to shop_items.id with ON DELETE SET NULL so deleting a cosmetic does
--      not strand the player profile)
--   4. Extends migration_log.content_type CHECK to include 'mystery' and
--      'shop_item' (closes a latent gap: the content engine recognises 'mystery'
--      but the constraint never accepted it)
--   5. Adds supporting indexes for catalog browse, inventory lookup, and
--      equipped-item joins for the leaderboard view
--   6. Adds the partial UNIQUE index for PayPal webhook idempotency
--      on bank_transactions(reference_id) WHERE reference_type='paypal_capture'
--
-- The companion OLAP migration is `025_marketplace_olap.sql`, which extends
-- the player_events.event_type CHECK to include 'iap_completed' and
-- 'shop_purchase'. Per project convention (see 019/020), OLAP and OLTP
-- migrations are separate files.

BEGIN;

-- ============================================================
-- 1. shop_items — the marketplace catalog
--    Authored via the YAML content pipeline (content/shop/*.yaml)
--    and upserted by server/src/content/upsert.ts::upsertShopItem.
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_items (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    item_type VARCHAR(30) NOT NULL
        CHECK (item_type IN ('ui_theme', 'avatar_border', 'character_skin')),
    price INTEGER NOT NULL CHECK (price >= 0),
    currency_type VARCHAR(20) NOT NULL DEFAULT 'gold_credits'
        CHECK (currency_type IN ('credits', 'gold_credits')),
    asset_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_items_active_type
    ON shop_items(item_type, is_active) WHERE is_active = TRUE;

-- ============================================================
-- 2. player_inventory — ownership ledger
--    A row per (user, shop_item). UNIQUE prevents duplicate
--    grants (idempotent for both purchase and webhook re-delivery).
-- ============================================================
CREATE TABLE IF NOT EXISTS player_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_item_id UUID NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
    acquired_via VARCHAR(30) NOT NULL DEFAULT 'purchase'
        CHECK (acquired_via IN ('purchase', 'grant', 'iap')),
    reference_id UUID,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_inventory_user_item
    ON player_inventory(user_id, shop_item_id);

CREATE INDEX IF NOT EXISTS idx_player_inventory_user
    ON player_inventory(user_id);

-- ============================================================
-- 3. public_profiles — equipped cosmetic slots
--    Two FK columns to shop_items(id) with ON DELETE SET NULL.
--    Drop one in: a designer deletes a Halloween border from
--    the catalog; PG clears the slot; the UI renders no border
--    instead of a broken image link.
-- ============================================================
ALTER TABLE public_profiles
    ADD COLUMN IF NOT EXISTS equipped_theme_id UUID
        REFERENCES shop_items(id) ON DELETE SET NULL;

ALTER TABLE public_profiles
    ADD COLUMN IF NOT EXISTS equipped_border_id UUID
        REFERENCES shop_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_public_profiles_equipped_theme
    ON public_profiles(equipped_theme_id);

CREATE INDEX IF NOT EXISTS idx_public_profiles_equipped_border
    ON public_profiles(equipped_border_id);

-- ============================================================
-- 4. Extend migration_log.content_type CHECK
--    Closes a latent gap: the engine recognises 'mystery'
--    (migrate.ts:74) and now 'shop_item', but the initial
--    constraint only allowed the original six. Pattern from
--    021_leaderboards.sql:49-53.
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
        'shop_item'
    ));

-- ============================================================
-- 5. Idempotency for PayPal webhook → bank_transactions
--    PayPal may redeliver the same PAYMENT.CAPTURE.COMPLETED
--    event. The webhook handler writes a bank_transactions
--    row with reference_type='paypal_capture' and reference_id
--    = the capture id. A partial UNIQUE index makes the
--    INSERT idempotent: a second redelivery hits 23505 and
--    we return 200 OK without double-granting credits.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_paypal_capture
    ON bank_transactions(reference_id)
    WHERE reference_type = 'paypal_capture';

COMMIT;
