import dotenv from 'dotenv';
import { createApp } from './app.js';
import { registerGameRoutes } from './routes/gameRoutes.js';
import { testConnections, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import { seedPlayers } from './database/seedPlayers.js';
import { LeaderboardWorker } from './workers/LeaderboardWorker.js';
import { RelationshipDecayWorker } from './workers/RelationshipDecayWorker.js';
import { resolveFileEnvVars } from './config/resolveFileEnvVars.js';

dotenv.config();

resolveFileEnvVars();

const app = createApp(registerGameRoutes);
const PORT = process.env.PORT || 3000;

async function initializeServer() {
  console.log('\u{1F3AE} Initializing Las Flores 2077 game-server (slim)...');

  const dbConnected = await testConnections();
  if (!dbConnected) {
    console.error('\u274C Failed to connect to databases. Exiting...');
    process.exit(1);
  }

  try {
    await seedPlayers();
  } catch (err) {
    console.warn('[seed:players] skipped:', (err as Error).message || err);
  }

  app.listen(PORT, () => {
    console.log(`\u{1F3AE} Las Flores 2077 game-server running on port ${PORT}`);
    console.log(`\u{1F4CA} Health check: http://localhost:${PORT}/health`);
    console.log(`\u{1F510} Auth: http://localhost:${PORT}/auth/dev-login`);
    console.log(`\u{1F3AF} Player state: http://localhost:${PORT}/player/state`);
    console.log('   (admin/content-authoring routes live on the intake-worker at port 3001)');
  });

  const LEADERBOARD_INTERVAL_MS = 5 * 60 * 1000;
  let isLeaderboardWorkerRunning = false;
  setInterval(async () => {
    if (isLeaderboardWorkerRunning) return;
    isLeaderboardWorkerRunning = true;
    try {
      await LeaderboardWorker.processExpiredMysteries();
    } catch (err) {
      console.error('[LeaderboardWorker] cron tick error:', err);
    } finally {
      isLeaderboardWorkerRunning = false;
    }
  }, LEADERBOARD_INTERVAL_MS);
  console.log(`\u{1F3C6} LeaderboardWorker scheduled every ${LEADERBOARD_INTERVAL_MS / 1000}s`);

  const DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000;
  let isDecayWorkerRunning = false;
  const runDecayTick = async () => {
    if (isDecayWorkerRunning) return;
    isDecayWorkerRunning = true;
    try {
      await RelationshipDecayWorker.processDecay();
    } catch (err) {
      console.error('[RelationshipDecayWorker] cron tick error:', err);
    } finally {
      isDecayWorkerRunning = false;
    }
  };
  void runDecayTick();
  setInterval(runDecayTick, DECAY_INTERVAL_MS);
  console.log(`\u{1F493} RelationshipDecayWorker scheduled every ${DECAY_INTERVAL_MS / 1000 / 60 / 60}h`);
}

async function shutdown() {
  console.log('\n\u{1F6D1} Shutting down game-server...');
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

initializeServer().catch(console.error);

export default app;
