BEGIN;

CREATE TABLE IF NOT EXISTS asset_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_rel TEXT NOT NULL,
    proposal_index INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    seed BIGINT,
    chosen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_id UUID NOT NULL REFERENCES asset_bases(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    image_path TEXT NOT NULL,
    i2i_strength NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_bases_prompt_rel ON asset_bases(prompt_rel);
CREATE INDEX IF NOT EXISTS idx_asset_variants_base_id ON asset_variants(base_id);

COMMIT;
