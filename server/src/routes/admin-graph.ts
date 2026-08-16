import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';
import { buildMergedRevision, detectGraphDrift } from '../services/GraphMerger.js';
import { gatherBaseGraphData } from '../services/GraphSeedSource.js';
import { upsertContentNode, upsertContentRelationship } from '../services/GraphBaseService.js';

export const adminGraphRouter = express.Router();

adminGraphRouter.use(authAndAdminMiddleware);

function envelope(data: unknown, timestamp = new Date().toISOString()) {
  return { success: true, data, timestamp };
}

// GET /admin/graph/plans/:id/merged-view — preview "lore if approved"
adminGraphRouter.get('/plans/:id/merged-view', async (req: AuthRequest, res) => {
  try {
    if (!isNeo4jEnabled()) {
      res.status(409).json({ success: false, error: 'Neo4j is disabled (NEO4J_ENABLED !== "true")', timestamp: new Date().toISOString() });
      return;
    }
    const planId = String(req.params.id);
    const revision = await buildMergedRevision(planId);
    res.json(envelope(revision));
  } catch (error: any) {
    console.error('[admin-graph] merged-view error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to build merged view', timestamp: new Date().toISOString() });
  }
});

// GET /admin/graph/drift — compare canonical graph to content store
adminGraphRouter.get('/drift', async (_req: AuthRequest, res) => {
  try {
    if (!isNeo4jEnabled()) {
      res.json(envelope({ inSync: true, disabled: true, orphanNodes: [], missingNodes: [], orphanEdges: [], missingEdges: [] }));
      return;
    }
    const report = await detectGraphDrift();
    res.json(envelope(report));
  } catch (error: any) {
    console.error('[admin-graph] drift error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to detect drift', timestamp: new Date().toISOString() });
  }
});

// POST /admin/graph/resync — re-derive the canonical graph from the store
adminGraphRouter.post('/resync', async (_req: AuthRequest, res) => {
  try {
    if (!isNeo4jEnabled()) {
      res.status(409).json({ success: false, error: 'Neo4j is disabled (NEO4J_ENABLED !== "true")', timestamp: new Date().toISOString() });
      return;
    }
    const data = await gatherBaseGraphData({ strict: true });
    let nodes = 0;
    let edges = 0;
    for (const node of data.nodes) {
      await upsertContentNode(node);
      nodes++;
    }
    for (const edge of data.edges) {
      await upsertContentRelationship(edge);
      edges++;
    }
    res.json(envelope({ nodes, edges, total: data.nodes.length }));
  } catch (error: any) {
    console.error('[admin-graph] resync error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to resync graph', timestamp: new Date().toISOString() });
  }
});
