BEGIN;

-- Add unique constraint for asset_bases to support ON CONFLICT in imports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_asset_bases_prompt_rel_index'
  ) THEN
    ALTER TABLE asset_bases ADD CONSTRAINT unique_asset_bases_prompt_rel_index
      UNIQUE (prompt_rel, proposal_index);
  END IF;
END $$;

-- Add unique constraint for asset_variants to support ON CONFLICT in imports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_asset_variants_base_variant'
  ) THEN
    ALTER TABLE asset_variants ADD CONSTRAINT unique_asset_variants_base_variant
      UNIQUE (base_id, variant_name);
  END IF;
END $$;

COMMIT;
