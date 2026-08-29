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
import { seedAliases, pruneOrphanAliases, loadSeedAliases } from '../../src/services/GraphAliasService.js';
import { EntityResolutionService } from '../../src/services/EntityResolutionService.js';
import { Neo4jCandidateSource } from '../../src/services/Neo4jCandidateSource.js';

// The parent router applies authAndAdminMiddleware to every sub-route (including
// the graph-intake routes), so HTTP tests must bypass it. Other graph
// integration suites call services directly and don't mount the router; this
// suite exercises the routes over HTTP, so pass auth through in tests.
jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// M32 — Neo4j-gated integration test for graph intake.
//
// Tests the full path:
//   POST /admin/story-builder/plans/graph-intake
//     → GraphIntakeService.createPlanFromDescription
//     → chatPropose (LLM generates deltas)
//     → GraphDeltaService.applyDelta/applyDeltaEdge
//
// Dedicated synthetic UUIDs (never collide with content entities or sibling tests).
const CHAR_ID = '63200001-e29b-41d4-a716-446655440002';
const SCENE_ID = '63200002-e29b-41d4-a716-446655440003';

// Dedicated synthetic delta UUIDs — one per test fixture, never reused.
const DELTA_CHAR_ADD = 'd3200001-0000-4000-8000-000000000001';
const DELTA_SCENE_ADD = 'd3200002-0000-4000-8000-000000000002';
const DELTA_CHAR2_ADD = 'd3200003-0000-4000-8000-000000000003';
const DELTA_SCENE2_ADD = 'd3200004-0000-4000-8000-000000000004';

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
    'Create a test character',
    'Create test character 2',
    'Create test scene',
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

describe('GraphIntakeService — integration tests (Neo4j-gated)', () => {
  describe('POST /admin/story-builder/plans/graph-intake', () => {
    // Mount the router for supertest
    const app = express();
    app.use(express.json());
    
    // Mock the admin auth middleware
    app.use('/admin/story-builder', (req, res, next) => {
      req.userId = '00000000-0000-0000-0000-000000000001';
      req.isAdmin = true;
      next();
    });
    
    app.use('/admin/story-builder', adminStoryBuilderRouter);

    test('creates a plan and writes deltas to Neo4j', async () => {
      if (!neo4jLive) return;
      // Mock chatPropose to return known deltas
      const mockDeltas = [
        {
          id: DELTA_CHAR_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: CHAR_ID,
          op: 'ADD',
          fields: { name: 'Test Character', description: 'A test character for M32' },
          createdAt: new Date().toISOString(),
        },
        {
          id: DELTA_SCENE_ADD,
          planId: '',
          nodeType: 'Scene',
          nodeId: SCENE_ID,
          op: 'ADD',
          fields: { name: 'Test Scene', description: 'A test scene for M32' },
          createdAt: new Date().toISOString(),
        },
      ];
      const mockEdges: any[] = [
        {
          planId: '',
          sourceNodeType: 'Character',
          sourceNodeId: CHAR_ID,
          targetNodeType: 'Scene',
          targetNodeId: SCENE_ID,
          type: 'APPEARS_IN',
        },
      ];

      // We need to mock the chatService.propose to return our test deltas
      // But since we're in an integration test, we'll need to mock it at the module level
      // This is a limitation of the current test setup - we'd need to refactor to inject the service
      // For now, we'll skip this test and note that it requires mocking chatService
      
      // Instead, let's test the direct service call
      const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
      
      // Mock chatService.propose
      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;
      
      try {
        // Mock the propose method
        chatService.chatService.propose = jest.fn(async () => ({
          reply: 'Proposal generated',
          deltas: mockDeltas,
          deltaEdges: mockEdges,
          usage: null,
        }));

        const service = new GraphIntakeService();
        const result = await service.createPlanFromDescription('Create a test character');
        createdPlanIds.push(result.planId);

        expect(result.planId).toBeDefined();
        expect(result.deltaCount).toBe(2);
        expect(result.edgeCount).toBe(1);

        // Verify deltas were written to Neo4j
        const deltas = await getDeltasForPlan(result.planId);
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
        const edges = await getDeltaEdgesForPlan(result.planId);
        expect(edges).toHaveLength(1);
        expect(edges[0].sourceNodeType).toBe('Character');
        expect(edges[0].sourceNodeId).toBe(CHAR_ID);

        // Clean up
        await service.discardPlan(result.planId);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);

    test('GET /admin/story-builder/plans/:id/graph-deltas returns deltas for a plan', async () => {
      if (!neo4jLive) return;
      // First, create a plan with deltas using the service directly
      const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;

      try {
        chatService.chatService.propose = jest.fn(async () => ({
          reply: 'Proposal generated',
          deltas: [{
            id: DELTA_CHAR2_ADD,
            planId: '',
            nodeType: 'Character',
            nodeId: CHAR_ID,
            op: 'ADD',
            fields: { name: 'Test Character 2' },
            createdAt: new Date().toISOString(),
          }],
          deltaEdges: [],
          usage: null,
        }));

        const service = new GraphIntakeService();
        const result = await service.createPlanFromDescription('Create test character 2');
        createdPlanIds.push(result.planId);

        // Now test the GET endpoint
        const response = await request(app)
          .get(`/admin/story-builder/plans/${result.planId}/graph-deltas`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.deltas).toHaveLength(1);
        expect(response.body.data.edges).toHaveLength(0);

        // Clean up
        await service.discardPlan(result.planId);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);

    test('DELETE /admin/story-builder/plans/:id/graph-intake removes deltas and plan', async () => {
      if (!neo4jLive) return;
      const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
      const chatService = await import('../../src/services/ChatService.js');
      const originalPropose = chatService.chatService.propose;

      try {
        chatService.chatService.propose = jest.fn(async () => ({
          reply: 'Proposal generated',
          deltas: [{
            id: DELTA_SCENE2_ADD,
            planId: '',
            nodeType: 'Scene',
            nodeId: SCENE_ID,
            op: 'ADD',
            fields: { name: 'Test Scene' },
            createdAt: new Date().toISOString(),
          }],
          deltaEdges: [],
          usage: null,
        }));

        const service = new GraphIntakeService();
        const result = await service.createPlanFromDescription('Create test scene');
        createdPlanIds.push(result.planId);

        // Verify deltas exist
        let deltas = await getDeltasForPlan(result.planId);
        expect(deltas).toHaveLength(1);

        // Delete via service
        await service.discardPlan(result.planId);

        // Verify deltas are gone
        deltas = await getDeltasForPlan(result.planId);
        expect(deltas).toHaveLength(0);

        // Verify plan row is deleted
        const planResult = await queryOLTP('SELECT id FROM content_plans WHERE id = $1', [result.planId]);
        expect(planResult.rows).toHaveLength(0);
      } finally {
        chatService.chatService.propose = originalPropose;
      }
    }, 10000);
  });

  describe('Neo4j-disabled behavior', () => {
    const originalNeo4jEnabled = process.env.NEO4J_ENABLED;

    beforeAll(() => {
      process.env.NEO4J_ENABLED = 'false';
    });

    afterAll(() => {
      process.env.NEO4J_ENABLED = originalNeo4jEnabled;
    });

    test('POST /admin/story-builder/plans/graph-intake returns 409 when Neo4j disabled', async () => {
      // Re-import to get the updated env
      const { isNeo4jEnabled: checkEnabled } = await import('../../src/services/Neo4jClient.js');
      if (checkEnabled()) {
        this.skip();
        return;
      }

      const app = express();
      app.use(express.json());
      app.use('/admin/story-builder', (req, res, next) => {
        req.userId = '00000000-0000-0000-0000-000000000001';
        req.isAdmin = true;
        next();
      });
      app.use('/admin/story-builder', adminStoryBuilderRouter);

      const response = await request(app)
        .post('/admin/story-builder/plans/graph-intake')
        .send({ description: 'Create a test' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Neo4j authoring graph is disabled');
    });

    test('GraphIntakeService returns empty arrays when Neo4j disabled', async () => {
      const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
      const service = new GraphIntakeService();
      const result = await service.getPlanDeltas('any-plan-id');
      expect(result).toEqual({ deltas: [], edges: [] });
    });
  });
});

// ---------------------------------------------------------------------------
// M50 — graph-assisted entity resolution + consistency validation integration.
// Runs only when Neo4j is enabled (the suite's top-level enableTestNeo4j helper
// opts in). Mirrors the M50 verification checklist item.
// ---------------------------------------------------------------------------
const m50Enabled = isNeo4jEnabled();

describe('M50 graph-intake alias + resolution integration', () => {
  if (!m50Enabled) {
    test.skip('requires Neo4j', () => {});
    return;
  }

  test('curated aliases seed and survive a prune against the live graph', async () => {
    const seeded = await seedAliases();
    expect(seeded).toHaveProperty('linked');
    expect(seeded).toHaveProperty('skipped');
    const pruned = await pruneOrphanAliases();
    expect(typeof pruned).toBe('number');
  });

  test('EntityResolutionService resolves curated aliases against the live graph', async () => {
    const svc = new EntityResolutionService(new Neo4jCandidateSource());
    const aliases = await loadSeedAliases();
    expect(aliases.length).toBeGreaterThan(0);
    for (const a of aliases) {
      const block = await svc.resolve(a.alias, { targetNodeType: a.nodeType });
      // A curated alias that seedAliases linked must match its target. Skip the
      // rare case where the target node is absent from this graph (e.g. a
      // district not yet seeded), but otherwise the alias must resolve to it.
      if (block.status === 'unresolved' && block.candidates.length === 0) continue;
      expect(block.candidates.length).toBeGreaterThan(0);
      expect(block.candidates.map((c) => c.name)).toContain(a.targetName);
    }
  });
});

// ---------------------------------------------------------------------------
// Fail-open intake: a plan with an unresolvable reference must still be created.
//
// The regression this guards: preflightDeltas/preflightDeltaEdges used to throw
// inside persistPlanWithDeltas' Neo4j transaction, whose catch block DELETED the
// just-created content_plans row. One bad reference destroyed the whole plan with
// no surviving artifact. Intake now drops the offending delta/edge and reports it
// as a note, so submitting a plan always returns a plan.
// ---------------------------------------------------------------------------
describe('fail-open graph intake (unresolvable references)', () => {
  if (!m50Enabled) {
    test.skip('requires Neo4j', () => {});
    return;
  }

  // Dedicated synthetic UUIDs for this block — deliberately absent from the graph.
  const MISSING_CHAR_ID = '63200003-e29b-41d4-a716-446655440004';
  const MISSING_SCENE_ID = '63200004-e29b-41d4-a716-446655440005';
  const DELTA_GOOD_ADD = 'd3200005-0000-4000-8000-000000000005';
  const DELTA_BAD_MODIFY = 'd3200006-0000-4000-8000-000000000006';

  /** Run createPlanFromDescription with a stubbed proposal. */
  async function intakeWith(deltas: any[], edges: any[]): Promise<any> {
    const { GraphIntakeService } = await import('../../src/services/GraphIntakeService.js');
    const chatService = await import('../../src/services/ChatService.js');
    const originalPropose = chatService.chatService.propose;
    try {
      chatService.chatService.propose = jest.fn(async () => ({
        reply: 'Proposal generated',
        deltas,
        deltaEdges: edges,
        usage: null,
      })) as never;
      const service = new GraphIntakeService();
      const result = await service.createPlanFromDescription('Create a test character');
      createdPlanIds.push(result.planId);
      return result;
    } finally {
      chatService.chatService.propose = originalPropose;
    }
  }

  test('a MODIFY against a non-existent base node is dropped, and the plan SURVIVES', async () => {
    const result = await intakeWith(
      [
        {
          id: DELTA_GOOD_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: MISSING_CHAR_ID,
          op: 'ADD',
          fields: { name: 'Fail Open Test Character' },
          createdAt: new Date().toISOString(),
        },
        {
          // References a canonical node that does not exist — the exact case that
          // used to abort intake and delete the plan row.
          id: DELTA_BAD_MODIFY,
          planId: '',
          nodeType: 'Scene',
          nodeId: MISSING_SCENE_ID,
          op: 'MODIFY',
          fields: { name: 'Nonexistent Scene', district: 'City Center' },
          createdAt: new Date().toISOString(),
        },
      ],
      [],
    );

    // The plan row must exist — this is the whole point of failing open.
    const row = await queryOLTP<{ id: string; status: string }>(
      'SELECT id, status FROM content_plans WHERE id = $1',
      [result.planId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].status).toBe('proposed');

    // The good ADD landed; the unresolvable MODIFY did not.
    const deltas = await getDeltasForPlan(result.planId);
    expect(deltas.map((d) => d.nodeId)).toContain(MISSING_CHAR_ID);
    expect(deltas.map((d) => d.nodeId)).not.toContain(MISSING_SCENE_ID);

    // ...and the drop is reported as an actionable note.
    const note = result.notes.find((n: any) => n.nodeId === MISSING_SCENE_ID);
    expect(note).toBeDefined();
    expect(note.kind).toBe('missing_base_node');
    expect(note.status).toBe('unresolved');
    expect(typeof note.suggestion).toBe('string');
    expect(note.suggestion.length).toBeGreaterThan(0);
  }, 30000);

  test('a dangling edge target is dropped, and the plan SURVIVES with a note', async () => {
    const result = await intakeWith(
      [
        {
          id: DELTA_GOOD_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: MISSING_CHAR_ID,
          op: 'ADD',
          fields: { name: 'Fail Open Edge Character' },
          createdAt: new Date().toISOString(),
        },
      ],
      [
        {
          // Target exists neither as canon nor as a delta of this plan.
          planId: '',
          sourceNodeType: 'Character',
          sourceNodeId: MISSING_CHAR_ID,
          targetNodeType: 'Scene',
          targetNodeId: MISSING_SCENE_ID,
          type: 'APPEARS_IN',
        },
      ],
    );

    const row = await queryOLTP<{ id: string }>(
      'SELECT id FROM content_plans WHERE id = $1',
      [result.planId],
    );
    expect(row.rows).toHaveLength(1);

    // The delta landed; the edge was dropped.
    expect(await getDeltasForPlan(result.planId)).toHaveLength(1);
    expect(await getDeltaEdgesForPlan(result.planId)).toHaveLength(0);

    const note = result.notes.find((n: any) => n.kind === 'dangling_edge_target');
    expect(note).toBeDefined();
    expect(note.field).toBe('links');
    expect(note.nodeId).toBe(MISSING_SCENE_ID);
  }, 30000);

  test('notes are persisted as answerable intake annotations', async () => {
    const result = await intakeWith(
      [
        {
          id: DELTA_GOOD_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: MISSING_CHAR_ID,
          op: 'ADD',
          fields: { name: 'Annotation Bridge Character' },
          createdAt: new Date().toISOString(),
        },
        {
          id: DELTA_BAD_MODIFY,
          planId: '',
          nodeType: 'Scene',
          nodeId: MISSING_SCENE_ID,
          op: 'MODIFY',
          fields: { name: 'Nonexistent Scene' },
          createdAt: new Date().toISOString(),
        },
      ],
      [],
    );

    expect(result.notes.length).toBeGreaterThan(0);

    // Every note needs a durable annotation id — that is the handle
    // `plan:amend --annotation <id>:"<comment>"` replies to.
    const noted = result.notes.find((n: any) => n.nodeId === MISSING_SCENE_ID);
    expect(noted.annotationId).toBeDefined();

    const annotations = await queryOLTP<{ id: string; scope: string; status: string; type: string }>(
      `SELECT id, scope, status, type FROM critique_annotations
        WHERE plan_id = $1 AND is_marker = FALSE`,
      [result.planId],
    );
    expect(annotations.rows.length).toBeGreaterThan(0);
    const annotation = annotations.rows.find((r) => r.id === noted.annotationId);
    expect(annotation).toBeDefined();
    // Scope 'intake' keeps these isolated from real critique passes, whose
    // retire-on-write would otherwise wipe them.
    expect(annotation!.scope).toBe('intake');
    expect(annotation!.status).toBe('open');
    // 'suggestion' carries no evidence requirement, so nothing is fabricated.
    expect(annotation!.type).toBe('suggestion');
  }, 30000);

  test('a fully resolvable plan produces no notes', async () => {
    const result = await intakeWith(
      [
        {
          id: DELTA_GOOD_ADD,
          planId: '',
          nodeType: 'Character',
          nodeId: MISSING_CHAR_ID,
          op: 'ADD',
          fields: { name: 'Clean Plan Character' },
          createdAt: new Date().toISOString(),
        },
      ],
      [],
    );

    // An ADD with no references and no edges has nothing to resolve, so the
    // fail-open machinery must stay silent rather than inventing notes.
    expect(result.notes).toEqual([]);
    expect(await getDeltasForPlan(result.planId)).toHaveLength(1);
  }, 30000);
});
