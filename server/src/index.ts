import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { testConnections, closeConnections, queryOLTP } from './database/connection.js';
import { closeRedis } from './database/redis.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

  await queryOLTP('ALTER TABLE users ADD COLUMN IF NOT EXISTS active_dialogue_id UUID REFERENCES dialogue_trees(id)');

  // Start server
  app.listen(PORT, () => {
    console.log(`🎮 Las Flores 2077 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Auth: http://localhost:${PORT}/auth/dev-login`);
    console.log(`🎯 Player state: http://localhost:${PORT}/player/state`);
  });
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
