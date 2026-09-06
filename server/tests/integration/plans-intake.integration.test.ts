/* eslint-disable max-lines-per-function */
import '../helpers/enableTestNeo4j.js';

import { beforeAll, afterAll, afterEach, describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { queryOLTP } from '@las-flores/infra';
import {
  isNeo4jEnabled,
  verifyNeo4j,
  closeNeo4j,
} from '../../src/services/Neo4jClient.js';
import { clearDeltasForPlan, getDeltasForPlan, getDeltaEdgesForPlan } from '../../src/services/GraphDeltaService.js';
import { ensureGraphConstraints } from '../../src/services/GraphBaseService.js';
import { adminStoryBuilderRouter } from '../../src/routes/admin-story-builder.js';
import { type GraphDelta, type GraphDeltaEdge } from '@las-flores/shared';

// The parent router applies authAndAdminMiddleware to every sub-route (including
// the plans-intake routes), so HTTP tests must bypass it.
jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// M51 — HTTP mirror of the validated CLI intake flow.
//
// Tests the full path:
//   POST /admin/story-builder/plans/intake
//     → GraphIntakeService.createPlanFromDescription
//     → chatPropose (LLM generates deltas)
//     → GraphDeltaService.applyDelta/applyDeltaEdge
//
// Dedicated synthetic UUIDs (never collide with content entities or sibling tests).
const CHAR_ID = '65100001-e29b-41d4-a716-446655440002';
const SCENE_ID = '65100002-e29b-41d4-a716-446655440003';

// Dedicated synthetic delta UUIDs — one per test fixture, never reused.
const DELTA_CHAR_ADD = 'd5100001-0000-4000-8000-000000000001';
const DELTA_SCENE_ADD = 'd5100002-0000-4000-8000-000000000002';
const DELTA_CHAR2_ADD = 'd5100003-0000-4000-8000-000000000003';
const DELTA_SCENE2_ADD = 'd5100004-0000-4000-8000-000000000004';

let neo4jLive = false;

// Plans are created with a server-generated UUID (createPlanFromDescription
// generates a fresh planId), so we track the actual ids this suite creates and
// clean up their deltas + rows after each test, regardless of pass/fail.
const createdPlanIds: string[] = [];

async function cleanupPlan(planId: string): Promise<void> {
  try {
    await clearDeltasForPlan(planId);
  } catch {
    /* ignore */
  }
  try {
    await queryOLTP('DELETE FROM critique_annotations WHERE plan_id = $1 AND scope = $2', [planId, 'intake']);
    await queryOLTP('DELETE FROM content_plans WHERE id = $1', [planId]);
  } catch {
    /* ignore */
  }
}

beforeAll(async () => {
  neo4jLive = isNeo4jEnabled() && (await verifyNeo4j());
  if (!neo4jLive) return;
  await ensureGraphConstraints();

  // Start-of-run sweep: a previous run hard-killed mid-test leaves a
  // content_plans row + Neo4j delta nodes keyed by a server-generated UUID no
  // later run tracks. These descriptions are unique to this suite, so delete
  // any stale rows (and their deltas) to prevent orphaned graph state from
  // accumulating across crashed/interrupted runs.
  const staleDescriptions = [
    'M51 test character',
    'M51 test character 2',
    'M51 test character with messages',
    'M51 test scene',
  ];
  for (const desc of staleDescriptions) {
    const rows = await queryOLTP<{ id: string }>(
      'SELECT id FROM content_plans WHERE description = $1',
      [desc],
    );
    for (const row of rows.rows) {
      await cleanupPlan(row.id);
    }
  }
});

afterAll(async () => {
  try {
    if (neo4jLive) {
      for (const id of createdPlanIds) {
        await cleanupPlan(id);
      }
    }
  } finally {
    await closeNeo4j();
  }
});

// Reset plan deltas between tests so a failure mid-test cannot leak graph state
// into later runs.
afterEach(async () => {
  if (!neo4jLive) return;
  for (const id of createdPlanIds) {
    await cleanupPlan(id);
  }
  createdPlanIds.length = 0;
});

describe('M51 Plan Intake HTTP Endpoint — integration tests (Neo4j-gated)', () => {
  describe('POST /admin/story-builder/plans/intake', () => {
    // Mount the router for supertest
    const app = express();
    app.use(express.json());
    
    // Mock the admin auth middleware
    app.use('/admin/story-builder', (req: any, res: any, next: any) => {
      req.userId = '00000000-0000-0000-0000-000000000001';
      req.isAdmin = true;
      next();
    });
    
    app.use('/admin/story-builder', adminStoryBuilderRouter);

    test('returns 400 when description is missing', async () => {
      const response = await request(app)
        .post('/admin/story-builder/plans/intake')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Description is required');
    });

    test('returns 400 when description is empty string', async () => {
      const response = await request(app)
        .post('/admin/story-builder/plans/intake')
        .send({ description: '   ' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Description is required');
    });

    test('returns 400 when messages is not an array', async () => {
      const response = await request(app)
        .post('/admin/story-builder/plans/intake')
        .send({ description: 'Create a test', messages: 'not an array' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('messages must be an array');
    });

    test('returns 400 when messages contains invalid role', async () => {
      const response = await request(app)
        .post('/admin/story-builder/plans/intake')
        .send({ 
          description: 'Create a test', 
          messages: [{ role: 'system', content: 'test' }] 
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('messages[0]');
    });

    test('returns 400 when messages contains empty content', async () => {
      const response = await request(app)
        .post('/admin/story-builder/plans/intake')
        .send({ 
          description: 'Create a test', 
          messages: [{ role: 'user', content: '' }] 
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('messages[0]');
      expect(response.body.error).toContain('Too small');
    });

    test('returns 409 when Neo4j disabled', async () => {
      const originalNeo4jEnabled = process.env.NEO4J_ENABLED;
      process.env.NEO4J_ENABLED = 'false';

      try {
        const response = await request(app)
          .post('/admin/story-builder/plans/intake')
          .send({ description: 'Create a test' })
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Neo4j authoring graph is disabled');
      } finally {
        process.env.NEO4J_ENABLED = originalNeo4jEnabled;
      }
    });

    test('creates a plan and writes deltas to Neo4j with actor attribution', async () => {
      if (!neo4jLive) return;
      
      // Mock chatPropose to return known deltas
      const mockDeltas: GraphDelta[] = [
        {
          id: DELTA_CHAR_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: CHAR_ID,
          op: 'ADD',
          fields: { name: 'M51 Test Character', description: 'A test character for M51' },
          createdAt: new Date().toISOString(),
        },
        {
          id: DELTA_SCENE_ADD,
          planId: '',
          nodeType: 'Scene',
          nodeId: SCENE_ID,
          op: 'ADD',
          fields: { name: 'M51 Test Scene', description: 'A test scene for M51' },
          createdAt: new Date().toISOString(),
        },
      ];
      const mockEdges: GraphDeltaEdge[] = [
        {
          planId: '',
          sourceNodeType: 'Character',
          sourceNodeId: CHAR_ID,
          targetNodeType: 'Scene',
          targetNodeId: SCENE_ID,
          type: 'APPEARS_IN',
        },
      ];

      // Mock chatService.propose
      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;
      const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

      try {
        // Mock the propose method
        chatService.chatService.propose = jest.fn(async () => ({
          reply: 'Proposal generated',
          deltas: mockDeltas,
          deltaEdges: mockEdges,
          usage: null,
        }));

        const response = await request(app)
          .post('/admin/story-builder/plans/intake')
          .send({ description: 'M51 test character' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.planId).toBeDefined();
        expect(response.body.data.description).toBe('M51 test character');
        expect(response.body.data.deltaCount).toBe(2);
        expect(response.body.data.edgeCount).toBe(1);
        expect(response.body.data.timestamp).toBeDefined();

        const planId = response.body.data.planId;
        createdPlanIds.push(planId);

        // Verify the plan was created in the database with correct actor
        const planRow = await queryOLTP<{ 
          id: string; 
          status: string; 
          created_by: string | null;
          description: string;
        }>(
          'SELECT id, status, created_by, description FROM content_plans WHERE id = $1',
          [planId],
        );
        expect(planRow.rows).toHaveLength(1);
        const plan = planRow.rows[0];
        expect(plan.status).toBe('proposed');
        expect(plan.created_by).toBe(TEST_USER_ID);
        expect(plan.description).toBe('M51 test character');

        // Verify deltas were written to Neo4j
        const deltas = await getDeltasForPlan(planId);
        expect(deltas).toHaveLength(2);
        const charDelta = deltas.find((d) => d.nodeId === CHAR_ID);
        const sceneDelta = deltas.find((d) => d.nodeId === SCENE_ID);
        expect(charDelta).toBeDefined();
        expect(charDelta!.nodeType).toBe('Character');
        expect(charDelta!.op).toBe('ADD');
        expect(sceneDelta).toBeDefined();
        expect(sceneDelta!.nodeType).toBe('Scene');
        expect(sceneDelta!.op).toBe('ADD');

        // Verify edges were written
        const edges = await getDeltaEdgesForPlan(planId);
        expect(edges).toHaveLength(1);
        expect(edges[0].sourceNodeType).toBe('Character');
        expect(edges[0].sourceNodeId).toBe(CHAR_ID);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);

    test('accepts valid messages array and passes to service', async () => {
      if (!neo4jLive) return;

      const mockDeltas: GraphDelta[] = [
        {
          id: DELTA_CHAR2_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: CHAR_ID,
          op: 'ADD',
          fields: { name: 'M51 Test Character 2', description: 'A test character for M51 with messages' },
          createdAt: new Date().toISOString(),
        },
      ];

      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;

      try {
        // Mock the propose method
        chatService.chatService.propose = jest.fn(async (_planId: string, messages: any[]) => {
          // Verify that messages were passed through
          expect(messages).toHaveLength(2);
          expect(messages[0].role).toBe('user');
          expect(messages[0].content).toBe('M51 test character with messages');
          expect(messages[1].role).toBe('user');
          expect(messages[1].content).toBe('Additional context');
          
          return {
            reply: 'Proposal generated',
            deltas: mockDeltas,
            deltaEdges: [],
            usage: null,
          };
        });

        const response = await request(app)
          .post('/admin/story-builder/plans/intake')
          .send({ 
            description: 'M51 test character with messages',
            messages: [
              { role: 'user', content: 'Additional context' }
            ]
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.planId).toBeDefined();
        
        const planId = response.body.data.planId;
        createdPlanIds.push(planId);
        
        // Clean up
        const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
        const service = new GraphIntakeService();
        await service.discardPlan(planId);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);

    test('returns correct JSON shape matching graph-intake endpoint', async () => {
      if (!neo4jLive) return;

      const mockDeltas: GraphDelta[] = [
        {
          id: DELTA_SCENE2_ADD,
          planId: '',
          nodeType: 'Scene',
          nodeId: SCENE_ID,
          op: 'ADD',
          fields: { name: 'M51 Test Scene 2' },
          createdAt: new Date().toISOString(),
        },
      ];

      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;

      try {
        chatService.chatService.propose = jest.fn(async () => ({
          reply: 'Proposal generated',
          deltas: mockDeltas,
          deltaEdges: [],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'test-model' },
        }));

        const response = await request(app)
          .post('/admin/story-builder/plans/intake')
          .send({ description: 'M51 test scene' })
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('data');
        
        const data = response.body.data;
        expect(data).toHaveProperty('planId');
        expect(data).toHaveProperty('description');
        expect(data).toHaveProperty('deltaCount');
        expect(data).toHaveProperty('edgeCount');
        expect(data).toHaveProperty('notes');
        expect(data).toHaveProperty('usage');
        expect(data).toHaveProperty('timestamp');
        
        expect(data.planId).toBeDefined();
        expect(data.description).toBe('M51 test scene');
        expect(data.deltaCount).toBe(1);
        expect(data.edgeCount).toBe(0);
        expect(Array.isArray(data.notes)).toBe(true);
        expect(data.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, model: 'test-model' });
        expect(typeof data.timestamp).toBe('string');
        
        createdPlanIds.push(data.planId);
        
        // Clean up
        const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
        const service = new GraphIntakeService();
        await service.discardPlan(data.planId);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);
  });
});
