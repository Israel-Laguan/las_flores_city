import express from 'express';

export const locationRouter = express.Router();

// GET /location/:id - Get location details
locationRouter.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Placeholder - will be implemented with actual database queries
  res.json({
    success: true,
    data: {
      id,
      name: 'Welcome Center',
      description: 'The official welcome center for new arrivals in Las Flores.',
      district: 'Downtown',
      image_url: null,
      available_dialogues: [],
      metadata: {},
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /location/:id/dialogues - Get available dialogues at location
locationRouter.get('/:id/dialogues', (req, res) => {
  const { id } = req.params;
  
  // Placeholder - will be implemented with actual database queries
  res.json({
    success: true,
    data: {
      location_id: id,
      dialogues: [],
    },
    timestamp: new Date().toISOString(),
  });
});
