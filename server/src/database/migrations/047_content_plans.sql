-- Las Flores 2077 - Content Plans for Story Builder persistence
-- Tracks content plans through their lifecycle: draft → proposed → approved → staged → migrated

CREATE TABLE IF NOT EXISTS content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposed', 'approved', 'staged', 'migrated', 'failed')),
  feedback_log JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_plans_status ON content_plans(status);
CREATE INDEX IF NOT EXISTS idx_content_plans_created_by ON content_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_content_plans_created_at ON content_plans(created_at DESC);
