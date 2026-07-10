-- Las Flores 2077 - Content Plans versioning
-- Add parent_plan_id to track plan refinement history

ALTER TABLE content_plans ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES content_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_content_plans_parent ON content_plans(parent_plan_id);
