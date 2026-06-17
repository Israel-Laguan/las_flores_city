import path from 'node:path';
import dotenv from 'dotenv';
import { LeaderboardWorker } from '../src/workers/LeaderboardWorker.js';
import { closeConnections, closeRedis } from '../src/database/connection.js';
import { closeRedis as closeRedisCache } from '../src/database/redis.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function main() {
  console.log('Running LeaderboardWorker once...');
  await LeaderboardWorker.processExpiredMysteries();
  console.log('Done.');
  await closeConnections();
  await closeRedisCache();
}

main().catch((err) => {
  console.error('Trigger script failed:', err);
  process.exit(1);
});
