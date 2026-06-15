import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import { healthRouter } from '../../src/routes/health.js';
import { playerRouter } from '../../src/routes/player.js';
import { locationRouter } from '../../src/routes/location.js';
import { dialogueRouter } from '../../src/routes/dialogue.js';

const app = express();
app.use(express.json());
app.use('/health', healthRouter);
app.use('/player', playerRouter);
app.use('/location', locationRouter);
app.use('/dialogue', dialogueRouter);

let server: any;
const PORT = 0;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

afterAll(async () => {
  if (server) server.close();
});

describe('API Contract Tests', () => {
  describe('GET /health', () => {
    test('returns valid health response', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('timestamp');
      expect(data.data).toHaveProperty('status', 'healthy');
      expect(data.data).toHaveProperty('service', 'las-flores-server');
      expect(data.data).toHaveProperty('version');
    });
  });

  describe('GET /player/state', () => {
    test('returns valid player state', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/player/state`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('timestamp');
      expect(data.data).toHaveProperty('user_id');
      expect(data.data).toHaveProperty('time_blocks');
      expect(data.data.time_blocks).toHaveProperty('current_blocks');
      expect(data.data.time_blocks).toHaveProperty('max_blocks');
      expect(data.data).toHaveProperty('flags');
      expect(Array.isArray(data.data.inventory)).toBe(true);
      expect(Array.isArray(data.data.discovered_locations)).toBe(true);
      expect(Array.isArray(data.data.completed_dialogues)).toBe(true);
    });
  });

  describe('GET /health/player-state', () => {
    test('returns valid player state health endpoint', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/health/player-state`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('time_blocks');
      expect(data.data.time_blocks).toHaveProperty('current_blocks');
      expect(data.data.time_blocks).toHaveProperty('max_blocks');
    });
  });

  describe('GET /location/:id', () => {
    test('returns valid location for welcome_center', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/location/welcome_center`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('id');
      expect(data.data).toHaveProperty('name');
      expect(data.data).toHaveProperty('description');
      expect(data.data).toHaveProperty('district');
      expect(Array.isArray(data.data.available_dialogues)).toBe(true);
      expect(typeof data.data.metadata).toBe('object');
    });
  });

  describe('GET /location/:id/dialogues', () => {
    test('returns dialogues for a location', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/location/welcome_center/dialogues`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('location_id');
      expect(Array.isArray(data.data.dialogues)).toBe(true);
    });
  });

  describe('GET /dialogue/:id', () => {
    test('returns valid dialogue tree', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/dialogue/welcome_dialogue`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('tree');
      expect(data.data).toHaveProperty('current_node');
      expect(data.data).toHaveProperty('available_choices');

      const tree = data.data.tree;
      expect(tree).toHaveProperty('id');
      expect(tree).toHaveProperty('name');
      expect(tree).toHaveProperty('start_node_id');
      expect(tree).toHaveProperty('nodes');
      expect(typeof tree.nodes).toBe('object');

      const currentNode = data.data.current_node;
      expect(currentNode).toHaveProperty('id');
      expect(currentNode).toHaveProperty('type');
      expect(currentNode).toHaveProperty('text');

      expect(Array.isArray(data.data.available_choices)).toBe(true);
    });
  });

  describe('POST /dialogue/:id/choose', () => {
    test('returns valid choice response', async () => {
      const port = server.address().port;
      const res = await fetch(`http://localhost:${port}/dialogue/welcome_dialogue/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_id: 'choice_1', node_id: 'start' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data.data).toHaveProperty('dialogue_id');
      expect(data.data).toHaveProperty('choice_id');
      expect(data.data).toHaveProperty('next_node');
      expect(data.data.next_node).toHaveProperty('id');
      expect(data.data.next_node).toHaveProperty('text');
      expect(data.data).toHaveProperty('time_blocks_spent');
      expect(typeof data.data.time_blocks_spent).toBe('number');
    });
  });
});
