#!/usr/bin/env node

/**
 * Sprint 0 Infrastructure Heartbeat Script
 * 
 * Run after `docker-compose up -d` to verify all services are healthy.
 * 
 * Usage: node scripts/heartbeat.mjs
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const results = [];
let failures = 0;

function log(status, service, message) {
  const icon = status === 'pass' ? '✅' : '❌';
  console.log(`${icon} ${service}: ${message}`);
  results.push({ status, service, message });
  if (status === 'fail') failures++;
}

async function checkOLTP() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5432/las_flores',
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query('SELECT 1 AS ok');
    if (result.rows[0].ok === 1) {
      log('pass', 'OLTP PostgreSQL', 'SELECT 1 successful');
    } else {
      log('fail', 'OLTP PostgreSQL', 'Unexpected response');
    }

    const tableResult = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = tableResult.rows.map(r => r.table_name);
    const required = ['users', 'characters', 'dialogue_trees', 'scenes', 'player_states'];
    const missing = required.filter(t => !tables.includes(t));
    
    if (missing.length === 0) {
      log('pass', 'OLTP Schema', `All ${required.length} required tables exist`);
    } else {
      log('fail', 'OLTP Schema', `Missing tables: ${missing.join(', ')}`);
    }
  } catch (error) {
    log('fail', 'OLTP PostgreSQL', error.message);
  } finally {
    await pool.end();
  }
}

async function checkOLAP() {
  const pool = new Pool({
    connectionString: process.env.ANALYTICS_DATABASE_URL || 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics',
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query('SELECT 1 AS ok');
    if (result.rows[0].ok === 1) {
      log('pass', 'OLAP PostgreSQL', 'SELECT 1 successful');
    } else {
      log('fail', 'OLAP PostgreSQL', 'Unexpected response');
    }

    const tableResult = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = tableResult.rows.map(r => r.table_name);
    
    if (tables.includes('player_events')) {
      log('pass', 'OLAP Schema', 'player_events table exists');
    } else {
      log('fail', 'OLAP Schema', 'player_events table missing');
    }
  } catch (error) {
    log('fail', 'OLAP PostgreSQL', error.message);
  } finally {
    await pool.end();
  }
}

async function checkRedis() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeoutOnClick: false,
  });

  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      log('pass', 'Redis', 'PING -> PONG');
    } else {
      log('fail', 'Redis', `Unexpected response: ${result}`);
    }

    await redis.set('heartbeat:test', 'ok');
    const value = await redis.get('heartbeat:test');
    if (value === 'ok') {
      log('pass', 'Redis', 'SET/GET working');
    } else {
      log('fail', 'Redis', 'SET/GET failed');
    }
    await redis.del('heartbeat:test');
  } catch (error) {
    log('fail', 'Redis', error.message);
  } finally {
    redis.disconnect();
  }
}

async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/health');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data.status === 'healthy') {
        log('pass', 'Server', 'GET /health -> 200 OK');
      } else {
        log('fail', 'Server', 'Health check returned unhealthy status');
      }
    } else {
      log('fail', 'Server', `HTTP ${response.status}`);
    }
  } catch (error) {
    log('fail', 'Server', `Connection failed: ${error.message}`);
  }
}

async function main() {
  console.log('\n🎮 Las Flores 2077 - Infrastructure Heartbeat\n');
  console.log('Checking all services...\n');

  await Promise.all([
    checkOLTP(),
    checkOLAP(),
    checkRedis(),
    checkServer(),
  ]);

  console.log('\n📊 Summary:');
  console.log(`  Total checks: ${results.length}`);
  console.log(`  Passed: ${results.filter(r => r.status === 'pass').length}`);
  console.log(`  Failed: ${failures}`);

  if (failures === 0) {
    console.log('\n🎉 All services are healthy!\n');
    process.exit(0);
  } else {
    console.log('\n💥 Some services are unhealthy.\n');
    process.exit(1);
  }
}

main();
