-- Dev user (no volatile gameplay columns — those go in player_states)
INSERT INTO users (id, email, username, display_name, password_hash)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@example.com', 'devuser', 'Dev User', '$2b$10$.Y/E52BFNQuYY96igPNPmeHk2YWCyUlohokSGVVQDv3BwzptIARi2')
ON CONFLICT (id) DO NOTHING;

-- Player state for dev user
INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_location_id, current_day, story_beat, alignment)
VALUES ('00000000-0000-0000-0000-000000000001', 48, 100, 50, '550e8400-e29b-41d4-a716-446655440002', 1, 'prologue', 'neutral')
ON CONFLICT (user_id) DO NOTHING;

-- Dev user relationships (previously in migration 004 DML)
INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 15, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440004', 5, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

INSERT INTO user_relationships (user_id, character_id, friendship_level, romance_level)
VALUES ('00000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440001', 10, 0)
ON CONFLICT (user_id, character_id) DO NOTHING;

-- Entitlements
INSERT INTO user_entitlements (user_id, is_premium, is_nsfw_unlocked, patreon_tier)
VALUES ('00000000-0000-0000-0000-000000000001', true, true, 'premium')
ON CONFLICT (user_id) DO NOTHING;
