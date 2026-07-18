-- M15: Mission reward claims for idempotent grant effects
-- Prevents double-granting of credits/items on dialogue retries

CREATE TABLE IF NOT EXISTS mission_reward_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  claim_key VARCHAR(255) NOT NULL UNIQUE,
  dialogue_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mission_reward_claims_user ON mission_reward_claims(user_id);
CREATE INDEX idx_mission_reward_claims_key ON mission_reward_claims(claim_key);
