import dotenv from 'dotenv';
import fs from 'node:fs';
import { createApp } from './app.js';
import { registerIntakeRoutes } from './routes/intakeRoutes.js';
import { testConnections, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { runAllMigrations } from './database/migrate.js';
import { seedPlayers } from './database/seedPlayers.js';
import { ContentAssetWorker } from './workers/ContentAssetWorker.js';
import { resumeSolidify } from './services/StoryBuilderOrchestrator.js';
import { resetOrphanedFillJobs } from './services/PlanGenerationJob.js';
import { markOrphanedResumable } from './services/JobRunService.js';

dotenv.config();

/**
 * Resolve _FILE environment variables to their plain counterparts.
 * (Duplicated from index.ts so each entrypoint remains self-bootstrapping
 * without pulling in the game app's module graph.)
 */
function resolveFileEnvVars() {
  const fileEnvMap: Record<string, string> = {
    JWT_SECRET_FILE: 'JWT_SECRET',
    PATREON_CLIENT_SECRET_FILE: 'PATREON_CLIENT_SECRET',
    PAYPAL_SECRET_FILE: 'PAYPAL_SECRET',
    MINIO_ACCESS_KEY_FILE: 'MINIO_ACCESS_KEY',
    MINIO_SECRET_KEY_FILE: 'MINIO_SECRET_KEY',
    CDN_SIGNING_SECRET_FILE: 'CDN_SIGNING_SECRET',
    POSTGRES_PASSWORD_FILE: 'POSTGRES_PASSWORD',
    POSTGRES_ANALYTICS_PASSWORD_FILE: 'POSTGRES_ANALYTICS_PASSWORD',
    MINIO_ROOT_USER_FILE: 'MINIO_ROOT_USER',
    MINIO_ROOT_PASSWORD_FILE: 'MINIO_ROOT_PASSWORD',
  };

  for (const [fileVar, targetVar] of Object.entries(fileEnvMap)) {
    const filePath = process.env[fileVar];
    if (filePath && !process.env[targetVar]) {
      try {
        const value = fs.readFileSync(filePath, 'utf8').trim();
        process.env[targetVar] = value;
        console.log(`🔐 Loaded ${targetVar} from ${fileVar}`);
      } catch (err) {
        console.warn(`⚠️ Could not read ${fileVar} at ${filePath}:`, err);
      }
    }
  }

  // Construct database URLs if passwords were loaded from _FILE secrets
  if (process.env.POSTGRES_PASSWORD && process.env.DATABASE_URL?.includes('${POSTGRES_PASSWORD}')) {
    const baseUrl = process.env.DATABASE_URL.replace('${POSTGRES_PASSWORD}', process.env.POSTGRES_PASSWORD);
    process.env.DATABASE_URL = baseUrl;
    console.log(`🔐 Constructed DATABASE_URL from POSTGRES_PASSWORD`);
  }

  if (process.env.POSTGRES_ANALYTICS_PASSWORD && process.env.ANALYTICS_DATABASE_URL?.includes('${POSTGRES_ANALYTICS_PASSWORD}')) {
    const baseUrl = process.env.ANALYTICS_DATABASE_URL.replace('${POSTGRES_ANALYTICS_PASSWORD}', process.env.POSTGRES_ANALYTICS_PASSWORD);
    process.env.ANALYTICS_DATABASE_URL = baseUrl;
    console.log(`🔐 Constructed ANALYTICS_DATABASE_URL from POSTGRES_ANALYTICS_PASSWORD`);
  }
}

resolveFileEnvVars();

// --- intake-worker entrypoint (M21 process split) ---
// Owns the content engine + StoryBuilder + ContentAssetWorker. This is the
// ONLY process that runs `runAllMigrations()` (which calls `migrateContent()`,
// acquiring the single-process `content_migration` advisory lock), so AI
// generation and content authoring never land on the game-server event loop.
const app = createApp(registerIntakeRoutes);
const PORT = process.env.PORT || 3001;

// Startup bootstrap: only the intake-worker migrates schema + content. This
// enforces the content_migration advisory-lock firewall (one writer).
async function initializeServer() {
  console.log('🛠️  Initializing Las Flores 2077 intake-worker...');

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

  // Startup reconciliation: reset stalled `generating` asset needs to `pending`
  // so ContentAssetWorker can retry them on the first tick.
  await ContentAssetWorker.reclaimStalledNeeds();

  // Startup recovery: flip orphaned in-flight jobs to `resumable` and dispatch
  // resume entry points (M22). `resetOrphanedFillJobs` also handles its own
  // resumable dispatch internally.
  const orphaned = await markOrphanedResumable();
  const orphanedSolidify = orphaned.filter(o => o.jobType === 'solidify');
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

  // Startup recovery: reset orphaned fill jobs to failed (legacy reclaim) +
  // resume any resumable plan_fill jobs.
  await resetOrphanedFillJobs();

  // Seed player accounts in non-production environments (dev convenience;
  // never fatal — keeps boot from aborting on refusal).
  try {
    await seedPlayers();
  } catch (err) {
    console.warn('[seed:players] skipped:', (err as Error).message || err);
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`🛠️  Las Flores 2077 intake-worker running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`   (admin/content-authoring routes — game-server is on port 3000)`);
  });

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
initializeServer().catch(console.error);

export default app;
