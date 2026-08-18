import dotenv from 'dotenv';
import { createApp } from './app.js';
import { registerIntakeRoutes } from './routes/intakeRoutes.js';
import { testConnections, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { runAllMigrations } from './database/migrate.js';
import { seedPlayers } from './database/seedPlayers.js';
import { ContentAssetWorker } from './workers/ContentAssetWorker.js';
import { resumeSolidify } from './services/StoryBuilderOrchestrator.js';
import { markOrphanedResumable } from './services/JobRunService.js';
import { verifyNeo4j } from './services/Neo4jClient.js';
import { resolveFileEnvVars } from './config/resolveFileEnvVars.js';

dotenv.config();

resolveFileEnvVars();

// --- intake-worker entrypoint (M21 process split) ---
// Owns the content engine + StoryBuilder + ContentAssetWorker. This is the
// ONLY process that runs `runAllMigrations()` (which calls `migrateContent()`,
// acquiring the single-process `content_migration` advisory lock), so AI
// generation and content authoring never land on the game-server event loop.
const app = createApp(registerIntakeRoutes);
const PORT = process.env.PORT || 3001;

/**
 * Retry a startup reconciliation a few times so a transient DB hiccup does not
 * permanently strand durable jobs for this worker lifetime. Returns the value,
 * or `undefined` if every attempt failed (startup continues, but the failure is
 * logged loudly rather than silently swallowed).
 */
async function withStartupRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
): Promise<T | undefined> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`[startup] ${label} attempt ${attempt} failed; retrying:`, err.message);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  console.error(`[startup] ${label} failed after ${retries} attempts:`, (lastErr as Error)?.message);
  return undefined;
}

// Startup bootstrap: only the intake-worker migrates schema + content. This
// enforces the content_migration advisory-lock firewall (one writer).
async function initializeServer() {
  console.log('🛠️  Initializing Las Flores 2077 intake-worker...');

  // Startup recovery boundary. Any job run created at/after this instant belongs
  // to THIS process (started via an intake route once the port is bound below),
  // so it must never be reclaimed as orphaned by the startup recovery. Passing
  // this cutoff to markOrphanedResumable() makes it claim only pre-existing runs.
  const startupCutoff = new Date();

  const dbConnected = await testConnections();
  if (!dbConnected) {
    console.error('❌ Failed to connect to databases. Exiting...');
    process.exit(1);
  }

  // Run pending schema + content migrations. This is the single process that
  // holds the content_migration advisory-lock reconcile; the game-server never
  // migrates and therefore never contends for it.
  try {
    await runAllMigrations();
  } catch (err) {
    console.error('❌ Migration failed. Exiting...', err);
    process.exit(1);
  }

  // Seed player accounts in non-production environments (dev convenience;
  // never fatal — keeps boot from aborting on refusal).
  try {
    await seedPlayers();
  } catch (err) {
    console.warn('[seed:players] skipped:', (err as Error).message || err);
  }

  // M27/M32 — Neo4j authoring canvas connectivity check (non-fatal boot, but
  // graph is now required for authoring approvals). When NEO4J_ENABLED is on
  // but the graph is unreachable, log a warning and continue so the health
  // endpoint stays alive; `approveAndSolidifyPlan` will fail loudly at runtime
  // until Neo4j is reachable.
  const neo4jOk = await verifyNeo4j();
  if (neo4jOk) {
    console.log('🕸️  Neo4j authoring graph reachable (M27/M32 substrate ready).');
  } else if (process.env.NEO4J_ENABLED === 'true') {
    console.warn('[Neo4j] graph enabled but unreachable — authoring approvals will fail until Neo4j is reachable.');
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`🛠️  Las Flores 2077 intake-worker running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`   (admin/content-authoring routes — game-server is on port 3000)`);
  });

  // Startup reconciliation: run after listener is bound so a failure here
  // cannot prevent the health endpoint from answering.
  try {
    await ContentAssetWorker.reclaimStalledNeeds();
  } catch (err: any) {
    console.warn('[startup] reclaimStalledNeeds failed:', err.message);
  }

  // Startup recovery: flip orphaned in-flight jobs to `resumable` and dispatch
  // resume entry points (M22). Runs created at/after `startupCutoff` belong to
  // THIS process (started via an intake route once the port is bound below), so
  // they are never reclaimed — a live request cannot be misclassified as a
  // crash orphan and double-executed. Transient failures are retried so the
  // recovery is not silently skipped.
  const orphaned = await withStartupRetry(
    () => markOrphanedResumable(startupCutoff),
    'markOrphanedResumable',
  );

  // If the initial claim failed all retries (transient DB hiccup), retry a
  // bounded claim now that the listener is live, so orphaned durable runs
  // (solidify AND plan_fill) are not stranded as `resumable` until the next
  // restart. The claim stays bounded by `startupCutoff`, so a live request
  // started after boot is never reclaimed and double-executed. A single claimed
  // list is shared by BOTH reconciliations below so no already-claimed row is
  // lost between them.
  const claimedOrphans = await withStartupRetry(async () => {
    if (orphaned) return orphaned;
    return await markOrphanedResumable(startupCutoff);
  }, 'markOrphanedResumable-recheck');

  const orphanedSolidify = (claimedOrphans ?? []).filter(o => o.jobType === 'solidify');
  if (orphanedSolidify.length > 0) {
    console.log(`[story-builder] Resuming ${orphanedSolidify.length} orphaned solidify job(s)`);
    for (const { planId } of orphanedSolidify) {
      try {
        await resumeSolidify(planId);
      } catch (err: any) {
        console.error(`[story-builder] Resume failed for ${planId}:`, err.message);
      }
    }
  }



  // Content asset worker — generate pending image drafts for verified plans every 30 seconds
  const ASSET_WORKER_INTERVAL_MS = 30 * 1000;
  let isAssetWorkerRunning = false;
  setInterval(async () => {
    if (isAssetWorkerRunning) return;
    isAssetWorkerRunning = true;
    try {
      await ContentAssetWorker.processPendingImageGeneration();
    } catch (err) {
      console.error('[ContentAssetWorker] cron tick error:', err);
    } finally {
      isAssetWorkerRunning = false;
    }
  }, ASSET_WORKER_INTERVAL_MS);
  console.log(`🎨 ContentAssetWorker scheduled every ${ASSET_WORKER_INTERVAL_MS / 1000}s`);
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down intake-worker...');
  await closeConnections();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Start server
initializeServer().catch((err) => {
  console.error('❌ intake-worker failed to start:', err);
  process.exit(1);
});

export default app;
