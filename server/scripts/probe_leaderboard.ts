import path from 'node:path';
import dotenv from 'dotenv';
import { oltpPool, queryOLAP, closeConnections } from '../src/database/connection.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function main() {
  const client = await oltpPool.connect();
  try {
    const { rows: expired } = await client.query(
      `SELECT id, title, status, expires_at,
              NOW() - expires_at AS age
         FROM mysteries
        WHERE status = 'RESOLVING'`
    );
    console.log('RESOLVING mysteries:', JSON.stringify(expired, null, 2));

    const { rows: solvers } = await client.query(
      `SELECT pm.user_id, pm.started_at, pm.solved_at, u.username
         FROM player_mysteries pm
         JOIN users u ON u.id = pm.user_id
        WHERE pm.mystery_id = $1
          AND pm.status = 'SOLVED'
          AND pm.solved_at IS NOT NULL`,
      ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']
    );
    console.log('SOLVED solvers:', JSON.stringify(solvers, null, 2));

    const userIds = solvers.map((s) => s.user_id);
    console.log('Querying OLAP for', userIds);
    const { rows: olap } = await queryOLAP(
      `SELECT user_id, COALESCE(SUM(time_blocks_cost), 0)::bigint AS tb_spent
         FROM player_events
        WHERE user_id = ANY($1::uuid[])
          AND event_type IN ('move', 'dialogue_choice', 'gig_completed')
        GROUP BY user_id`,
      [userIds]
    );
    console.log('OLAP results:', JSON.stringify(olap, null, 2));
  } catch (err) {
    console.error('PROBE ERROR:', err);
  } finally {
    client.release();
    await closeConnections();
  }
}

main();
