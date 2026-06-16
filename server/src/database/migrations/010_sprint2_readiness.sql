-- Sprint 2 Readiness: metadata flags for sleep locations and SMS-reachable NPCs

BEGIN;

-- Mark apartment scenes as valid sleep locations
UPDATE scenes
SET metadata = metadata || '{"is_sleep_location": true}'
WHERE id IN (
    'c3d4e5f6-a7b8-9012-cdef-123456789012',  -- The Apartment
    '550e8400-e29b-41d4-a716-446655440002'   -- Suburban Apartment
);

-- Mark active NPCs as reachable via SMS
UPDATE characters
SET metadata = metadata || '{"is_reachable_via_sms": true}'
WHERE id IN (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- The Handler
    'b2c3d4e5-f6a7-8901-bcde-f12345678901'   -- Marco (Barista)
);

COMMIT;
