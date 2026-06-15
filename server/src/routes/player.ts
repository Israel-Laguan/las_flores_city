import express from 'express';

export const playerRouter = express.Router();

// GET /player/state - Get current player state
playerRouter.get('/state', (req, res) => {
  // Placeholder - will be implemented with actual database queries
  res.json({
    success: true,
    data: {
      user_id: '00000000-0000-0000-0000-000000000001',
      time_blocks: {
        current_blocks: 12,
        max_blocks: 12,
        last_refresh_at: new Date().toISOString(),
      },
      current_location_id: null,
      active_dialogue_id: null,
      current_node_id: null,
      flags: {},
      inventory: [],
      discovered_locations: [],
      completed_dialogues: [],
      last_activity_at: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// POST /player/spend-time-blocks - Spend time blocks
playerRouter.post('/spend-time-blocks', (req, res) => {
  const { amount, description } = req.body;
  
  // Placeholder - will be implemented with actual database logic
  res.json({
    success: true,
    data: {
      spent: amount,
      description,
      remaining: 12 - amount,
    },
    timestamp: new Date().toISOString(),
  });
});

// POST /player/set-flag - Set a player flag
playerRouter.post('/set-flag', (req, res) => {
  const { key, value } = req.body;
  
  // Placeholder - will be implemented with actual database logic
  res.json({
    success: true,
    data: {
      key,
      value,
    },
    timestamp: new Date().toISOString(),
  });
});
