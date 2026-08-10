import path from 'node:path';
import dotenv from 'dotenv';
import { LeaderboardWorker } from '../src/workers/LeaderboardWorker.js';
import { closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function main() {
  console.log('Running LeaderboardWorker once...');
  await LeaderboardWorker.processExpiredMysteries();
  console.log('Done.');
  await closeConnections();
  await closeRedis();
}

main().catch((err) => {
  console.error('Trigger script failed:', err);
  process.exit(1);
});
