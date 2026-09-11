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
// Usage: DATABASE_URL=... node scripts/spikes/sc-s2-duplicate.mjs

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

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

const { rows: countRows } = await client.query(
  `SELECT count(*)::int AS n FROM spike_sc_s1.entity_edges`,
);
console.log(`row count after 10x duplication: ${countRows[0].n}`);

await client.end();
