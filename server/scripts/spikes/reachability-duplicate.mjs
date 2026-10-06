#!/usr/bin/env node
// SC-S2: simulate 10x content volume in spike_sc_s1.entity_edges.
//
// A naive "INSERT INTO ... SELECT * FROM entity_edges" 9x over would leave
// every from_slug/to_slug pair byte-identical across copies. That does NOT
// multiply the *reachability graph* — the recursive CTE's distinct node
// count and fan-out stay exactly what they are today, and duplicate flag
// names would additionally splice unrelated copies together into one
// accidentally-denser graph. Either way the 10x number would be measuring
// "scan 10x as many duplicate rows for the same graph" or "an artificially
// hyper-connected graph," neither of which represents what happens when
// there's actually 10x more scenes/dialogues/characters.
//
// Instead this duplicates by generation: for generations 2..10, every
// from_slug/to_slug value gets a "::genN" suffix, so each generation is a
// fully disjoint, structurally-identical copy of today's graph (same
// per-node fan-out, same flag-sharing pattern within a generation, zero
// cross-generation edges). That gives 10x the rows, 10x the distinct nodes,
// and 10x the disjoint reachability components — a defensible lower bound
// for "10x more content shaped like today's," but it does NOT simulate
// longer chains or richer interconnection that genuinely new content might
// introduce. See the write-up for why that gap matters.
//
// Usage: DATABASE_URL=... node server/scripts/spikes/reachability-duplicate.mjs

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

// This script is NOT idempotent by design (each generation must be inserted from
// the *original* rows only), so guard against a second run: re-running would
// append another 9 generations on top of the existing ones and the subsequent
// reachability-run.mjs measurement would silently label a different volume "10x".
//
// The guard and the inserts must be one atomic unit. Checking first and inserting
// after (two autocommit statements) let two concurrent runs both observe zero ::gen
// rows, both pass, and each append nine generations — leaving a 19x table that
// still looks like a success. A single transaction holding an ACCESS EXCLUSIVE
// lock on the table serialises the runs: the second blocks on LOCK until the first
// commits, then its guard sees the committed ::gen rows and aborts.
await client.query("BEGIN");
let existingGenRows;
try {
  await client.query(
    "LOCK TABLE spike_sc_s1.entity_edges IN ACCESS EXCLUSIVE MODE",
  );
  const result = await client.query(
    `SELECT count(*)::int AS n FROM spike_sc_s1.entity_edges WHERE from_slug LIKE '%::gen%'`,
  );
  existingGenRows = result.rows;
  if (existingGenRows[0].n > 0) {
    await client.query("ROLLBACK");
    await client.end();
    console.error(
      `spike_sc_s1.entity_edges already contains ${existingGenRows[0].n} ::gen rows. ` +
        'Rebuild the table with spikes/entity-edges-projection.mjs before re-duplicating.',
    );
    process.exit(1);
  }

  for (let gen = 2; gen <= 10; gen++) {
    await client.query(
      `
      INSERT INTO spike_sc_s1.entity_edges (from_type, from_slug, edge_kind, to_type, to_slug, attrs)
      SELECT from_type, from_slug || '::gen' || $1::text, edge_kind, to_type, to_slug || '::gen' || $1::text, attrs
      FROM spike_sc_s1.entity_edges
      WHERE from_slug NOT LIKE '%::gen%'
    `,
      [gen],
    );
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  await client.end();
  throw err;
}

const { rows: countRows } = await client.query(
  `SELECT count(*)::int AS n FROM spike_sc_s1.entity_edges`,
);
console.log(`row count after 10x duplication: ${countRows[0].n}`);

await client.end();
