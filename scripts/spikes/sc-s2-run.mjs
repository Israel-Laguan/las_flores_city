#!/usr/bin/env node
// SC-S2 spike runner: EXPLAIN ANALYZE + wall-clock timing for the
// recursive-CTE reachability query, against spike_sc_s1.entity_edges at
// whatever volume currently sits in that table (run once at 1x, once after
// duplicating rows for 10x — see sc-s2-duplicate.mjs).
//
// Usage: DATABASE_URL=... node scripts/spikes/sc-s2-run.mjs

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores";

const sql = fs.readFileSync(
  path.join(import.meta.dirname, "sc-s2-reachability.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: countRows } = await client.query(
  `SELECT count(*)::int AS n FROM spike_sc_s1.entity_edges`,
);
console.log(`=== row count in spike_sc_s1.entity_edges: ${countRows[0].n} ===`);

// Wall-clock: 5 timed runs of the plain query (process.hrtime around
// client.query), report min/median/max — a timed script run, not \timing,
// since this runner already holds the open connection.
const WARMUP = 1;
const RUNS = 5;
const timings = [];
for (let i = 0; i < WARMUP + RUNS; i++) {
  const start = process.hrtime.bigint();
  const { rowCount } = await client.query(sql);
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  if (i >= WARMUP) timings.push(ms);
  if (i === WARMUP) console.log(`reachable node count: ${rowCount}`);
}
timings.sort((a, b) => a - b);
console.log("=== wall-clock (ms), 1 warmup + 5 timed runs ===");
console.log(
  `min: ${timings[0].toFixed(2)}  median: ${timings[2].toFixed(2)}  max: ${timings[4].toFixed(2)}`,
);
console.log(`all: ${timings.map((t) => t.toFixed(2)).join(", ")}`);

// EXPLAIN ANALYZE, raw, unedited
const { rows: explainRows } = await client.query(`EXPLAIN ANALYZE\n${sql}`);
console.log("\n=== EXPLAIN ANALYZE ===");
for (const r of explainRows) console.log(r["QUERY PLAN"]);

await client.end();
