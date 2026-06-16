UPDATE users 
SET current_location_id = '550e8400-e29b-41d4-a716-446655440002', -- Suburban Apartment UUID
    current_node_id = 'd8b5a3e1-e123-4567-89ab-cdef01234567',     -- Awakening Start Node UUID
    time_blocks = 48,
    credits = 100
WHERE email = 'test_handler@lasflores.com';
