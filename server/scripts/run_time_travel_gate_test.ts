/**
 * Manual "Time Travel" Gate Test — automated verification
 * Runs the full mystery → breakthrough → leaderboard flow via API + SQL.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { queryOLTP, queryOLAP, closeConnections } from '../src/database/connection.js';
import { closeRedis } from '../src/database/redis.js';
import { generateToken } from '../src/middleware/auth.js';
import { LeaderboardWorker } from '../src/workers/LeaderboardWorker.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const API = process.env.GATE_API_URL || 'http://localhost:3000';
const USER_ID = 'f3333333-3333-4333-8333-cccccccccccc';
const MYSTERY_ID = 'a0000000-e29b-41d4-a716-446655440001';
const BARISTA_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const CAFE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

const results: Array<{ step: string; pass: boolean; detail: string }> = [];

const record = (step: string, pass: boolean, detail: string) => {
  results.push({ step, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${step}: ${detail}`);
};

async function api(method: string, route: string, body?: object) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${generateToken(USER_ID)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log('=== Time Travel Gate Test ===\n');

  await queryOLTP(
    `INSERT INTO mysteries (id, title, description, status)
     VALUES ($1, 'The Old Town Leak', 'Gate test mystery', 'ACTIVE')
     ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', expires_at = NULL`,
    [MYSTERY_ID]
  );

  await queryOLTP(
    `INSERT INTO vault_items (id, title, description, media_url, item_type, mystery_id)
     VALUES ($1, 'Corrupted Data Drive', 'Gate test clue', 'https://cdn.lasflores2077.com/clues/clue_usb_drive.png', 'clue', $2)
     ON CONFLICT (id) DO NOTHING`,
    ['b0000000-e29b-41d4-a716-446655440001', MYSTERY_ID]
  );

  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'gate-test@lasflores.com', 'gate_test_user', 'Gate Test')
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [USER_ID]
  );
  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, current_location_id, current_node_id, active_dialogue_id, story_beat, flags, alignment)
     VALUES ($1, 48, 100, 0, 1, $2, NULL, NULL, 'prologue', '{}'::jsonb, 'neutral')
     ON CONFLICT (user_id) DO UPDATE SET
       time_blocks = 48, credits = 100, current_location_id = $2,
       current_node_id = NULL, active_dialogue_id = NULL, current_day = 1`,
    [USER_ID, CAFE_ID]
  );
  await queryOLTP(
    `INSERT INTO public_profiles (user_id, badges) VALUES ($1, '[]'::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET badges = '[]'::jsonb`,
    [USER_ID]
  );
  await queryOLTP(
    `DELETE FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
    [USER_ID, MYSTERY_ID]
  );

  // Step 1: Start dialogue and join mystery via hook choice
  const start = await api('POST', '/dialogue/start', {
    characterId: BARISTA_ID,
    sceneId: CAFE_ID,
  });
  if (start.status !== 201) {
    record('Step 1: Start dialogue', false, `HTTP ${start.status}`);
    return printSummary();
  }

  const dialogueId = start.json.data?.tree?.id as string;

  const approach = await api('POST', `/dialogue/${dialogueId}/choose`, { choiceIndex: 0 });
  if (!approach.json.success) {
    record('Step 1: Approach counter', false, JSON.stringify(approach.json));
    return printSummary();
  }

  const choices = approach.json.data?.available_choices as Array<{ text: string }>;
  const driveIdx = choices?.findIndex((c) => c.text.includes('flashing drive')) ?? -1;
  if (driveIdx < 0) {
    record('Step 1: Hook choice visible', false, 'Corrupted Data Drive choice not in tree');
    return printSummary();
  }

  const hook = await api('POST', `/dialogue/${dialogueId}/choose`, { choiceIndex: driveIdx });
  const takeChoices = hook.json.data?.available_choices as Array<{ text: string }>;
  const takeIdx = takeChoices?.findIndex((c) =>
    c.text.toLowerCase().includes('take it')
  );
  if (takeIdx === undefined || takeIdx < 0) {
    record('Step 1: Take drive choice', false, 'Missing take-drive choice');
    return printSummary();
  }

  const join = await api('POST', `/dialogue/${dialogueId}/choose`, { choiceIndex: takeIdx });
  if (!join.json.success) {
    record('Step 1: Join mystery', false, JSON.stringify(join.json));
    return printSummary();
  }

  const pm = await queryOLTP<{ status: string }>(
    `SELECT status FROM player_mysteries WHERE user_id = $1 AND mystery_id = $2`,
    [USER_ID, MYSTERY_ID]
  );
  record(
    'Step 1: player_mysteries INVESTIGATING',
    pm.rows[0]?.status === 'INVESTIGATING',
    pm.rows[0]?.status ?? 'no row'
  );

  // Step 2: Protocol 7 breakthrough
  const protocolIdx = (join.json.data?.available_choices as Array<{ text: string }>)?.findIndex((c) =>
    c.text.includes('Protocol 7')
  );
  if (protocolIdx === undefined || protocolIdx < 0) {
    record('Step 2: Protocol 7 choice', false, 'Choice not found');
    return printSummary();
  }

  const solve = await api('POST', `/dialogue/${dialogueId}/choose`, { choiceIndex: protocolIdx });
  const breakthrough = solve.json.data?.mystery_solve_status?.isBreakthrough === true;
  record('Step 2: Breakthrough response', breakthrough, JSON.stringify(solve.json.data?.mystery_solve_status));

  const mystery = await queryOLTP<{ status: string; expires_at: string | null }>(
    `SELECT status, expires_at FROM mysteries WHERE id = $1`,
    [MYSTERY_ID]
  );
  record(
    'Step 2: mysteries RESOLVING + expires_at',
    mystery.rows[0]?.status === 'RESOLVING' && mystery.rows[0]?.expires_at != null,
    `${mystery.rows[0]?.status} expires=${mystery.rows[0]?.expires_at}`
  );

  const feedAfterBreakthrough = await api('GET', '/network/feed');
  const posts = Array.isArray(feedAfterBreakthrough.json) ? feedAfterBreakthrough.json : feedAfterBreakthrough.json.data ?? [];
  const hasBreakthroughPost = posts.some(
    (p: { content?: string }) => p.content?.includes('[BREAKTHROUGH]')
  );
  record('Step 2: Feed BREAKTHROUGH post', hasBreakthroughPost, hasBreakthroughPost ? 'found' : 'not found');

  // Step 3: Time travel + worker
  await queryOLTP(
    `UPDATE mysteries SET expires_at = NOW() - INTERVAL '5 minutes' WHERE id = $1 AND status = 'RESOLVING'`,
    [MYSTERY_ID]
  );
  await LeaderboardWorker.processExpiredMysteries();

  const archived = await queryOLTP<{ status: string }>(
    `SELECT status FROM mysteries WHERE id = $1`,
    [MYSTERY_ID]
  );
  record('Step 3: mysteries ARCHIVED', archived.rows[0]?.status === 'ARCHIVED', archived.rows[0]?.status ?? '');

  const lb = await queryOLTP<{ rank: number; total_tb_spent: number }>(
    `SELECT rank, total_tb_spent FROM leaderboards WHERE mystery_id = $1 AND user_id = $2`,
    [MYSTERY_ID, USER_ID]
  );
  record(
    'Step 3: Leaderboard entry with TB',
    lb.rows.length > 0,
    lb.rows[0] ? `rank=${lb.rows[0].rank} tb=${lb.rows[0].total_tb_spent}` : 'no row'
  );

  const feedAfterClose = await api('GET', '/network/feed');
  const posts2 = Array.isArray(feedAfterClose.json) ? feedAfterClose.json : feedAfterClose.json.data ?? [];
  const hasCaseClosed = posts2.some((p: { content?: string }) => p.content?.includes('[CASE CLOSED]'));
  record('Step 3: Feed CASE CLOSED post', hasCaseClosed, hasCaseClosed ? 'found' : 'not found');

  const profile = await queryOLTP<{ badges: unknown }>(
    `SELECT badges FROM public_profiles WHERE user_id = $1`,
    [USER_ID]
  );
  const badges = profile.rows[0]?.badges;
  const badgeList = Array.isArray(badges) ? badges : [];
  const hasBreakthroughBadge = badgeList.some(
    (b: { type?: string; badge_type?: string }) =>
      b?.type === 'breakthrough' || b?.badge_type === 'breakthrough'
  );
  record('Step 3: breakthrough badge', hasBreakthroughBadge, JSON.stringify(badgeList));

  const olapTb = await queryOLAP<{ total: string }>(
    `SELECT COALESCE(SUM(time_blocks_cost), 0)::text AS total
     FROM player_events
     WHERE user_id = $1
       AND event_type IN ('move', 'dialogue_choice', 'gig_completed')`,
    [USER_ID]
  );
  record(
    'Step 3: OLAP dialogue_choice telemetry',
    parseInt(olapTb.rows[0]?.total ?? '0', 10) > 0,
    `tb_spent=${olapTb.rows[0]?.total}`
  );

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n=== Gate Result: ${passed}/${total} checks passed ===`);
  if (passed < total) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Gate test failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnections();
    await closeRedis();
  });
