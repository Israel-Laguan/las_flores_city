import express from 'express';

export const healthRouter = express.Router();

healthRouter.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'las-flores-server',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/player-state', (req, res) => {
  // Placeholder - will be implemented with actual player state
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
