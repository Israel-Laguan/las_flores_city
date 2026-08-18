// ============================================================
// GraphResyncService — tracked, locked canonical graph re-sync (M28)
//
// Re-derives the canonical `:Content` base graph from the content store and
// repairs orphan drift by pruning nodes/relationships no longer backed by the
// store. The work is wrapped in `withGraphWriteLock` so it cannot overlap a
// `commitGraph`. The HTTP handler returns immediately with a job id (202
// Accepted) while the work runs; `runGraphResyncNow` awaits it (used by the
// CLI). Concurrent resync starts are rejected via an in-flight guard.
// ============================================================

import { randomUUID } from 'node:crypto';
import { isNeo4jEnabled } from './Neo4jClient.js';
import { gatherBaseGraphData } from './GraphSeedSource.js';
import {
  ensureGraphConstraints,
  upsertContentNode,
  upsertContentRelationship,
  pruneOrphanContentNodes,
  pruneOrphanContentEdges,
} from './GraphBaseService.js';
import { withGraphWriteLock } from './graphLock.js';

export interface ResyncJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  nodes: number;
  edges: number;
  deletedNodes: number;
  deletedEdges: number;
  total: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, ResyncJobStatus>();
// Bounded in-memory retention: completed/failed jobs are evicted on a FIFO basis
// so repeated admin resyncs cannot grow process memory without bound.
const MAX_JOBS = 50;
let resyncInFlight = false;

function recordJob(job: ResyncJobStatus): void {
  jobs.set(job.jobId, job);
  if (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value as string | undefined;
    if (oldest) jobs.delete(oldest);
  }
}

export function getResyncJob(jobId: string): ResyncJobStatus | undefined {
  return jobs.get(jobId);
}

async function performResync(status: ResyncJobStatus): Promise<void> {
  await withGraphWriteLock(async () => {
    await ensureGraphConstraints();
    const data = await gatherBaseGraphData({ strict: true });
    status.total = data.nodes.length;

    for (const node of data.nodes) {
      await upsertContentNode(node);
      status.nodes++;
    }
    for (const edge of data.edges) {
      await upsertContentRelationship(edge);
      status.edges++;
    }

    // Repair orphan drift: drop canonical nodes/edges absent from the source.
    const keepKeys = new Set(data.nodes.map((n) => `${n.nodeType}:${n.nodeId}`));
    const keepEdgeKeys = new Set(
      data.edges.map((e) => `${e.sourceNodeType}:${e.sourceNodeId}->${e.targetNodeType}:${e.targetNodeId}[${e.type}]`),
    );
    // Prune edges first so the relationship count reflects every edge actually
    // removed; otherwise DETACH DELETE in node pruning silently removes edges
    // that `pruneOrphanContentEdges` would then never see (undercounting).
    status.deletedEdges = await pruneOrphanContentEdges(keepEdgeKeys);
    status.deletedNodes = await pruneOrphanContentNodes(keepKeys);
  });
  status.status = 'completed';
  status.finishedAt = new Date().toISOString();
}

export async function runGraphResyncNow(): Promise<ResyncJobStatus> {
  if (!isNeo4jEnabled()) {
    throw new Error('Neo4j is disabled (NEO4J_ENABLED !== "true")');
  }
  if (resyncInFlight) {
    throw new Error('A graph resync is already in progress');
  }
  resyncInFlight = true;
  const jobId = randomUUID();
  const status: ResyncJobStatus = {
    jobId,
    status: 'running',
    nodes: 0,
    edges: 0,
    deletedNodes: 0,
    deletedEdges: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };
  recordJob(status);
  try {
    await performResync(status);
  } catch (err) {
    status.status = 'failed';
    status.error = (err as Error).message;
    status.finishedAt = new Date().toISOString();
    throw err;
  } finally {
    resyncInFlight = false;
  }
  return status;
}

export function startGraphResync(): ResyncJobStatus {
  if (!isNeo4jEnabled()) {
    throw new Error('Neo4j is disabled (NEO4J_ENABLED !== "true")');
  }
  if (resyncInFlight) {
    throw new Error('A graph resync is already in progress');
  }
  resyncInFlight = true;
  const jobId = randomUUID();
  const status: ResyncJobStatus = {
    jobId,
    status: 'running',
    nodes: 0,
    edges: 0,
    deletedNodes: 0,
    deletedEdges: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };
  recordJob(status);
  performResync(status)
    .catch((err) => {
      status.status = 'failed';
      status.error = (err as Error).message;
      status.finishedAt = new Date().toISOString();
    })
    .finally(() => { resyncInFlight = false; });
  return status;
}
