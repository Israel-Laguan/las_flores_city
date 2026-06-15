import express from 'express';

export const dialogueRouter = express.Router();

// GET /dialogue/:id - Get dialogue tree
dialogueRouter.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Placeholder - will be implemented with actual database queries
  res.json({
    success: true,
    data: {
      tree: {
        id,
        name: 'Welcome Dialogue',
        description: 'The initial dialogue for new players',
        start_node_id: 'start',
        nodes: {
          start: {
            id: 'start',
            type: 'narrator',
            text: 'Welcome to Las Flores, a city of dreams and mysteries.',
            choices: [
              {
                id: 'choice_1',
                text: 'Tell me more about this city.',
                next_node_id: 'about_city',
                time_block_cost: { amount: 1, description: 'Learning about the city' },
              },
              {
                id: 'choice_2',
                text: 'Where am I?',
                next_node_id: 'where_am_i',
                time_block_cost: { amount: 1, description: 'Getting oriented' },
              },
            ],
          },
          about_city: {
            id: 'about_city',
            type: 'narrator',
            text: 'Las Flores is a sprawling metropolis where technology and tradition dance in the neon-lit streets.',
          },
          where_am_i: {
            id: 'where_am_i',
            type: 'narrator',
            text: 'You stand in the Welcome Center, the gateway to your new life in Las Flores.',
          },
        },
      },
      current_node: {
        id: 'start',
        type: 'narrator',
        text: 'Welcome to Las Flores, a city of dreams and mysteries.',
      },
      available_choices: [
        {
          id: 'choice_1',
          text: 'Tell me more about this city.',
          next_node_id: 'about_city',
          time_block_cost: { amount: 1, description: 'Learning about the city' },
        },
        {
          id: 'choice_2',
          text: 'Where am I?',
          next_node_id: 'where_am_i',
          time_block_cost: { amount: 1, description: 'Getting oriented' },
        },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

// POST /dialogue/:id/choose - Make a dialogue choice
dialogueRouter.post('/:id/choose', (req, res) => {
  const { id } = req.params;
  const { choice_id, node_id } = req.body;
  
  // Placeholder - will be implemented with actual database logic
  res.json({
    success: true,
    data: {
      dialogue_id: id,
      choice_id,
      next_node: {
        id: 'about_city',
        type: 'narrator',
        text: 'Las Flores is a sprawling metropolis where technology and tradition dance in the neon-lit streets.',
      },
      time_blocks_spent: 1,
    },
    timestamp: new Date().toISOString(),
  });
});
