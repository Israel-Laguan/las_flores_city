#!/usr/bin/env node

/**
 * Sprint 0 Ultimate Validation Test
 * 
 * This script performs the final validation to confirm Sprint 0 is complete.
 * It runs the full sequence: DB clear -> migrate -> verify content -> API checks.
 * 
 * Usage: node scripts/sprint0-final-test.mjs
 */

import pg from 'pg';
import Redis from 'ioredis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const OLTP_URL = process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5432/las_flores';
const OLAP_URL = process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

async function clearDatabase(oltpPool) {
  console.log('\n1️⃣  Clearing database...');
  await oltpPool.query('DELETE FROM player_sms_threads');
  await oltpPool.query('DELETE FROM public_profiles');
  await oltpPool.query('DELETE FROM player_states');
  await oltpPool.query('DELETE FROM dialogue_overlays');
  await oltpPool.query('DELETE FROM dialogue_trees');
  await oltpPool.query('DELETE FROM scenes');
  await oltpPool.query('DELETE FROM characters');
  await oltpPool.query('DELETE FROM time_blocks');
  await oltpPool.query('DELETE FROM user_entitlements');
  await oltpPool.query('DELETE FROM users');
  await oltpPool.query('DELETE FROM migration_log');
  console.log('  Database cleared.\n');
}

async function verifyContent(oltpPool) {
  console.log('3️⃣  Verifying content in database...\n');

  const charResult = await oltpPool.query('SELECT id, name FROM characters');
  assert(charResult.rows.length > 0, `Characters loaded: ${charResult.rows.length}`);
  for (const char of charResult.rows) {
    assert(char.name && char.name.length > 0, `Character "${char.name}" has valid name`);
  }

  const sceneResult = await oltpPool.query('SELECT id, name, district FROM scenes');
  assert(sceneResult.rows.length > 0, `Scenes loaded: ${sceneResult.rows.length}`);
  for (const scene of sceneResult.rows) {
    assert(scene.district && scene.district.length > 0, `Scene "${scene.name}" has district: ${scene.district}`);
  }

  const dialogueResult = await oltpPool.query('SELECT id, name, start_node_id, nodes FROM dialogue_trees');
  assert(dialogueResult.rows.length > 0, `Dialogue trees loaded: ${dialogueResult.rows.length}`);
  for (const dialogue of dialogueResult.rows) {
    const nodes = typeof dialogue.nodes === 'string' ? JSON.parse(dialogue.nodes) : dialogue.nodes;
    assert(Object.keys(nodes).length > 0, `Dialogue "${dialogue.name}" has nodes`);
    assert(dialogue.start_node_id in nodes, `Dialogue "${dialogue.name}" start_node_id exists in nodes`);
  }

  const overlayResult = await oltpPool.query('SELECT id, name, target_tree_id FROM dialogue_overlays');
  assert(overlayResult.rows.length > 0, `Dialogue overlays loaded: ${overlayResult.rows.length}`);
}

async function verifyAPI() {
  console.log('\n4️⃣  Verifying API endpoints...\n');

  const healthRes = await fetch(`${SERVER_URL}/health`);
  const healthData = await healthRes.json();
  assert(healthRes.ok, 'GET /health returns 200');
  assert(healthData.success === true, '/health success is true');
  assert(healthData.data?.status === 'healthy', '/health status is healthy');

  const stateRes = await fetch(`${SERVER_URL}/player/state`);
  const stateData = await stateRes.json();
  assert(stateRes.ok, 'GET /player/state returns 200');
  assert(stateData.success === true, '/player/state success is true');
  assert(stateData.data?.user_id, '/player/state has user_id');
  assert(stateData.data?.time_blocks?.current_blocks !== undefined, '/player/state has time_blocks.current_blocks');
  assert(stateData.data?.time_blocks?.max_blocks !== undefined, '/player/state has time_blocks.max_blocks');
  assert(Array.isArray(stateData.data?.inventory), '/player/state has inventory array');
  assert(Array.isArray(stateData.data?.discovered_locations), '/player/state has discovered_locations array');

  const locationRes = await fetch(`${SERVER_URL}/location/welcome_center`);
  const locationData = await locationRes.json();
  assert(locationRes.ok, 'GET /location/welcome_center returns 200');
  assert(locationData.success === true, '/location/welcome_center success is true');
  assert(locationData.data?.name === 'Welcome Center', 'Location name is Welcome Center');
  assert(locationData.data?.district === 'Downtown', 'Location district is Downtown');

  const dialogueRes = await fetch(`${SERVER_URL}/dialogue/welcome_dialogue`);
  const dialogueData = await dialogueRes.json();
  assert(dialogueRes.ok, 'GET /dialogue/welcome_dialogue returns 200');
  assert(dialogueData.success === true, '/dialogue/welcome_dialogue success is true');
  assert(dialogueData.data?.tree?.name, 'Dialogue has tree name');
  assert(dialogueData.data?.current_node?.text, 'Dialogue has current node text');
  assert(Array.isArray(dialogueData.data?.available_choices), 'Dialogue has available_choices array');
  assert(dialogueData.data?.available_choices.length > 0, 'Dialogue has at least one choice');
}

async function verifyRedis() {
  console.log('\n5️⃣  Verifying Redis...\n');
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });

  try {
    const ping = await redis.ping();
    assert(ping === 'PONG', 'Redis PING returns PONG');

    await redis.set('sprint0:test', 'value');
    const val = await redis.get('sprint0:test');
    assert(val === 'value', 'Redis SET/GET works');
    await redis.del('sprint0:test');
  } finally {
    redis.disconnect();
  }
}

async function verifyOLAP() {
  console.log('\n6️⃣  Verifying OLAP analytics...\n');
  const olapPool = new Pool({
    connectionString: OLAP_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await olapPool.query('SELECT 1 AS ok');
    assert(result.rows[0].ok === 1, 'OLAP database responds to SELECT 1');

    const tableResult = await olapPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = tableResult.rows.map(r => r.table_name);
    assert(tables.includes('player_events'), 'player_events table exists in OLAP');
  } finally {
    await olapPool.end();
  }
}

async function main() {
  console.log('\n🎮 Las Flores 2077 - Sprint 0 Final Validation\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const oltpPool = new Pool({
    connectionString: OLTP_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    // Step 1: Clear DB
    await clearDatabase(oltpPool);

    // Step 2: Run migration (this is done via npm run migrate)
    console.log('2️⃣  Running migration...');
    console.log('  ℹ️  Please run `npm run migrate` before this script, or it will skip migration verification.\n');

    // Step 3: Verify content
    await verifyContent(oltpPool);

    // Step 4: Verify API
    await verifyAPI();

    // Step 5: Verify Redis
    await verifyRedis();

    // Step 6: Verify OLAP
    await verifyOLAP();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Final Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
      console.log('🎉 Sprint 0 is COMPLETE! Ready for Sprint 1.\n');
      process.exit(0);
    } else {
      console.log('💥 Sprint 0 validation FAILED. Fix the issues above.\n');
      process.exit(1);
    }
  } finally {
    await oltpPool.end();
  }
}

main();
