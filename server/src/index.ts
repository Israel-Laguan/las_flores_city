import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { cookieParserMiddleware } from './utils/cookies.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { playerRouter } from './routes/player.js';
import { locationRouter } from './routes/location.js';
import { dialogueRouter } from './routes/dialogue.js';
import { bankRouter } from './routes/bank.js';
import { gigsRouter } from './routes/gigs.js';
import { commsRouter } from './routes/comms.js';
import './routes/comms-reply.js';
import { feedRouter } from './routes/feed.js';
import { vaultRouter } from './routes/vault.js';
import { settingsRouter } from './routes/settings.js';
import { patreonRouter } from './routes/patreon.js';
import { shopRouter } from './routes/shop.js';
import { paypalRouter } from './routes/paypal.js';
import { archiveRouter } from './routes/archive.js';
import { devRouter } from './routes/dev.js';
import { mapRouter } from './routes/map.js';
import { assetsRouter } from './routes/assets.js';
import { assetsImportRouter } from './routes/assets-import.js';
import { adminContentRouter } from './routes/admin-content.js';
import { testConnections, closeConnections } from './database/connection.js';
import { closeRedis } from './database/redis.js';
import { runAllMigrations } from './database/migrate.js';
import { LeaderboardWorker } from './workers/LeaderboardWorker.js';

dotenv.config();

// Resolve _FILE environment variables to their plain counterparts
// This allows Docker secrets to work with code that reads plain env vars
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

const app = express();
const PORT = process.env.PORT || 3000;

// Cookie parser — populates req.cookies from the Cookie header (no cookie-parser dep)
app.use(cookieParserMiddleware);

// CORS — env-driven allowlist; true = reflect request origin (dev / same-domain prod)
const corsOrigins = process.env.CLIENT_ORIGIN_URL
  ? process.env.CLIENT_ORIGIN_URL.split(',').map((s: string) => s.trim())
  : null;
app.use(cors({
  origin: corsOrigins ?? true,
  credentials: true,
}));
app.use(express.json());

// Accept /api prefix on all routes — used by test direct-backend calls in CI
// and by production reverse proxies. The Vite dev server strips /api before
// forwarding, so this middleware is a no-op when running behind Vite.
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4);
  }
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/player', playerRouter);
app.use('/location', locationRouter);
app.use('/dialogue', dialogueRouter);
app.use('/bank', bankRouter);
app.use('/gigs', gigsRouter);
app.use('/comms', commsRouter);
app.use('/network/feed', feedRouter);
app.use('/vault', vaultRouter);
app.use('/settings', settingsRouter);
app.use('/patreon', patreonRouter);
app.use('/shop', shopRouter);
app.use('/paypal', paypalRouter);
app.use('/dev', devRouter);
app.use('/archive', archiveRouter);
app.use('/map', mapRouter);
app.use('/assets', assetsRouter);
app.use('/assets', assetsImportRouter);
app.use('/admin/content', adminContentRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
});

// Initialize database connections
async function initializeServer() {
  console.log('🎮 Initializing Las Flores 2077 Server...');
  
  // Test database connections
  const dbConnected = await testConnections();
  if (!dbConnected) {
    console.error('❌ Failed to connect to databases. Exiting...');
    process.exit(1);
  }

  // Run pending schema + content migrations
  try {
    await runAllMigrations();
  } catch (err) {
    console.error('❌ Migration failed. Exiting...', err);
    process.exit(1);
  }

  // Start server
  app.listen(PORT, () => {
    console.log(`🎮 Las Flores 2077 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Auth: http://localhost:${PORT}/auth/dev-login`);
    console.log(`🎯 Player state: http://localhost:${PORT}/player/state`);
  });

  // Leaderboard worker — finalize expired 24h Breakthrough windows every 5 minutes
  const LEADERBOARD_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    LeaderboardWorker.processExpiredMysteries().catch((err) =>
      console.error('[LeaderboardWorker] cron tick error:', err)
    );
  }, LEADERBOARD_INTERVAL_MS);
  console.log(`🏆 LeaderboardWorker scheduled every ${LEADERBOARD_INTERVAL_MS / 1000}s`);
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down server...');
  await closeConnections();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
initializeServer().catch(console.error);

export default app;
