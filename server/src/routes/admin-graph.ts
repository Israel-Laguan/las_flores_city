import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { isNeo4jEnabled } from '../services/Neo4jClient.js';
import { buildMergedRevision, detectGraphDrift } from '../services/GraphMerger.js';
import { startGraphResync, getResyncJob } from '../services/GraphResyncService.js';

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

// GET /admin/graph/resync/:jobId — poll a resync job's status
adminGraphRouter.get('/resync/:jobId', async (req: AuthRequest, res) => {
  try {
    const job = getResyncJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ success: false, error: 'Unknown resync job', timestamp: new Date().toISOString() });
      return;
    }
    res.json(envelope(job));
  } catch (error: any) {
    console.error('[admin-graph] resync status error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to read resync status', timestamp: new Date().toISOString() });
  }
});

// POST /admin/graph/resync — re-derive the canonical graph from the store.
// Runs as a tracked background job (under the graph write lock) and returns
// immediately with a 202 Accepted + job id; poll GET /resync/:jobId for results.
adminGraphRouter.post('/resync', async (_req: AuthRequest, res) => {
  try {
    if (!isNeo4jEnabled()) {
      res.status(409).json({ success: false, error: 'Neo4j is disabled (NEO4J_ENABLED !== "true")', timestamp: new Date().toISOString() });
      return;
    }
    let job;
    try {
      job = startGraphResync();
    } catch (err) {
      // Already in flight (or disabled) — report as a conflict.
      res.status(409).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
      return;
    }
    res.status(202).json(envelope({
      jobId: job.jobId,
      status: job.status,
      nodes: job.nodes,
      edges: job.edges,
      deletedNodes: job.deletedNodes,
      deletedEdges: job.deletedEdges,
      total: job.total,
    }));
  } catch (error: any) {
    console.error('[admin-graph] resync error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to start resync', timestamp: new Date().toISOString() });
  }
});
