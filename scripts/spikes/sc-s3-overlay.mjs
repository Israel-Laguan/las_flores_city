#!/usr/bin/env node
// SC-S3 spike: overlay view (canon LEFT JOIN plan_deltas, jsonb merge for
// MODIFY) built on top of SC-S1's entity_edges table. Hand-authors one ADD
// delta and one MODIFY delta, builds the overlay per plan-graph-in-postgres.md
// §3.3, and runs SC-S2's reachability query against canon alone vs. overlay.
//
// Requires spike_sc_s1.entity_edges to already exist (run
// sc-s1-project-entity-edges.mjs first).
//
// Usage: DATABASE_URL=... node scripts/spikes/sc-s3-overlay.mjs

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores";

const SCHEMA = "spike_sc_s3";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

// ---------------------------------------------------------------------------
// 1. Schema: canon_entities (minimal jsonb capture of the two touched
//    entities' real payload shape) + plan_deltas (per §3.1)
// ---------------------------------------------------------------------------

await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await client.query(`CREATE SCHEMA ${SCHEMA}`);

await client.query(`
  CREATE TABLE ${SCHEMA}.canon_entities (
    entity_type TEXT NOT NULL,
    entity_slug TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (entity_type, entity_slug)
  )
`);

await client.query(`
  CREATE TABLE ${SCHEMA}.plan_deltas (
    plan_id      TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_slug  TEXT NOT NULL,
    op           TEXT NOT NULL CHECK (op IN ('ADD', 'MODIFY', 'DELETE')),
    payload      JSONB,
    base_hash    TEXT,
    position     INT NOT NULL,
    UNIQUE (plan_id, entity_type, entity_slug)
  )
`);

// canon payload for dialogue_vq_endings#vq_endings_start, real shape/values
// lifted from content/dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml
// (choices array trimmed to the required_flags-bearing fields that matter to
// projection; two of the four real choices carry no required_flags at all,
// which is exactly what makes this a fair array-merge test).
const CANON_VQ_ENDINGS_START = {
  choices: [
    { id: "branch_grounded", required_flags: { vq_gave_space: true } },
    { id: "branch_shut_out", required_flags: { vq_pushed_away: true } },
    { id: "branch_departed" },
    { id: "branch_friends" },
  ],
};

await client.query(
  `INSERT INTO ${SCHEMA}.canon_entities (entity_type, entity_slug, payload) VALUES ($1, $2, $3)`,
  ["dialogue_node", "dialogue_vq_endings#vq_endings_start", CANON_VQ_ENDINGS_START],
);

const planId = "plan_sc_s3_test";

// ADD delta: a new dialogue_node not present in canon. Full snapshot payload
// per §3.1 ("full for ADD"). Deliberately gated on vq_gave_space, an
// existing canon flag already set at depth 0 (dialogue_vq_push#vq_push_space_end),
// so it should surface at depth 1 in the overlay traversal if composition works.
const ADD_PAYLOAD = {
  speaker_id: "670eea6f-3983-4d5a-8195-b08be6c81661",
  effects: { flag_set: { vq_epilogue_seen: true } },
  choices: [{ id: "c1", required_flags: { vq_gave_space: true } }],
};

// MODIFY delta: changed-fields-only payload per §3.1 ("changed fields only
// for MODIFY"). Only branch_grounded's gate is changing (vq_gave_space ->
// vq_never_set_flag, a flag nothing in canon ever sets). branch_shut_out,
// branch_departed, branch_friends are untouched by the author's intent and
// must survive the merge unchanged.
const MODIFY_PAYLOAD = {
  choices: [{ id: "branch_grounded", required_flags: { vq_never_set_flag: true } }],
};

const { rows: hashRows } = await client.query(
  `SELECT md5(payload::text) AS h FROM ${SCHEMA}.canon_entities WHERE entity_slug = $1`,
  ["dialogue_vq_endings#vq_endings_start"],
);
const baseHash = hashRows[0].h;

await client.query(
  `INSERT INTO ${SCHEMA}.plan_deltas (plan_id, entity_type, entity_slug, op, payload, base_hash, position)
   VALUES
     ($1, 'dialogue_node', 'dialogue_vq_push#vq_push_epilogue_added', 'ADD', $2, NULL, 1),
     ($1, 'dialogue_node', 'dialogue_vq_endings#vq_endings_start', 'MODIFY', $3, $4, 2)`,
  [planId, ADD_PAYLOAD, MODIFY_PAYLOAD, baseHash],
);

// ---------------------------------------------------------------------------
// 2. Overlay per §3.3: canon LEFT JOIN plan_deltas, DELETE filtered (none
//    here), jsonb merge (`||`, the "single operator") for MODIFY.
// ---------------------------------------------------------------------------

const { rows: overlayNaive } = await client.query(`
  SELECT
    d.entity_slug,
    d.op,
    CASE
      WHEN d.op = 'ADD' THEN d.payload
      WHEN d.op = 'MODIFY' THEN c.payload || d.payload
    END AS merged_payload
  FROM ${SCHEMA}.plan_deltas d
  LEFT JOIN ${SCHEMA}.canon_entities c
    ON c.entity_type = d.entity_type AND c.entity_slug = d.entity_slug
  WHERE d.plan_id = $1 AND d.op != 'DELETE'
`, [planId]);

console.log("=== §3.3 naive jsonb merge (canon.payload || delta.payload) ===");
for (const r of overlayNaive) {
  console.log(`${r.entity_slug} [${r.op}]:`, JSON.stringify(r.merged_payload));
}

// ---------------------------------------------------------------------------
// 3. Project edges from the overlay entities (same projection rules SC-S1
//    used: effects.flag_set -> sets_flag, choices[].required_flags -> requires_flag)
//    for BOTH the naive merge and a corrected per-field (array-aware) merge,
//    so the reachability query can be run three ways.
// ---------------------------------------------------------------------------

function projectEdges(fromSlug, payload) {
  const edges = [];
  const flagSet = payload.effects?.flag_set;
  if (flagSet) {
    for (const flag of Object.keys(flagSet)) {
      edges.push({ from_slug: fromSlug, edge_kind: "sets_flag", to_slug: flag });
    }
  }
  for (const choice of payload.choices || []) {
    for (const flag of Object.keys(choice.required_flags || {})) {
      edges.push({ from_slug: fromSlug, edge_kind: "requires_flag", to_slug: flag });
    }
  }
  return edges;
}

// Corrected merge: array-aware — merge `choices` element-by-element on `id`
// instead of letting `||` replace the whole array wholesale.
function correctedMerge(canonPayload, deltaPayload) {
  const merged = { ...canonPayload, ...deltaPayload };
  if (canonPayload.choices && deltaPayload.choices) {
    const byId = new Map(canonPayload.choices.map((c) => [c.id, c]));
    for (const deltaChoice of deltaPayload.choices) {
      const existing = byId.get(deltaChoice.id) || {};
      byId.set(deltaChoice.id, { ...existing, ...deltaChoice });
    }
    merged.choices = [...byId.values()];
  }
  return merged;
}

const addEntity = overlayNaive.find((r) => r.op === "ADD");
const modifyNaive = overlayNaive.find((r) => r.op === "MODIFY");
const modifyCorrected = correctedMerge(CANON_VQ_ENDINGS_START, MODIFY_PAYLOAD);

console.log("\n=== corrected (per-field / array-aware) merge ===");
console.log(`${modifyNaive.entity_slug} [MODIFY, corrected]:`, JSON.stringify(modifyCorrected));

const addEdges = projectEdges(addEntity.entity_slug, addEntity.merged_payload);
const modifyEdgesNaive = projectEdges(modifyNaive.entity_slug, modifyNaive.merged_payload);
const modifyEdgesCorrected = projectEdges(modifyNaive.entity_slug, modifyCorrected);

console.log("\nADD projected edges:", addEdges);
console.log("MODIFY projected edges (naive merge):   ", modifyEdgesNaive);
console.log("MODIFY projected edges (corrected merge):", modifyEdgesCorrected);

// ---------------------------------------------------------------------------
// 4. Materialize two overlay edge tables (naive vs. corrected) as copies of
//    canon entity_edges: canon's stale requires_flag edges for the MODIFY
//    target replaced with the merged projection, plus the ADD entity's edges.
// ---------------------------------------------------------------------------

async function buildOverlayTable(tableName, modifyEdges) {
  await client.query(`DROP TABLE IF EXISTS ${SCHEMA}.${tableName}`);
  await client.query(`CREATE TABLE ${SCHEMA}.${tableName} (LIKE spike_sc_s1.entity_edges INCLUDING ALL)`);
  await client.query(`
    INSERT INTO ${SCHEMA}.${tableName} (from_type, from_slug, edge_kind, to_type, to_slug, attrs)
    SELECT from_type, from_slug, edge_kind, to_type, to_slug, attrs
    FROM spike_sc_s1.entity_edges
    WHERE NOT (from_type = 'dialogue_node' AND from_slug = $1 AND edge_kind = 'requires_flag')
  `, [modifyNaive.entity_slug]);

  for (const e of [...addEdges, ...modifyEdges]) {
    const toType = e.edge_kind === "sets_flag" || e.edge_kind === "requires_flag" ? "flag" : "unknown";
    await client.query(
      `INSERT INTO ${SCHEMA}.${tableName} (from_type, from_slug, edge_kind, to_type, to_slug, attrs)
       VALUES ('dialogue_node', $1, $2, $3, $4, '{}'::jsonb)`,
      [e.from_slug, e.edge_kind, toType, e.to_slug],
    );
  }
}

await buildOverlayTable("overlay_naive_edges", modifyEdgesNaive);
await buildOverlayTable("overlay_corrected_edges", modifyEdgesCorrected);

// ---------------------------------------------------------------------------
// 5. Run SC-S2's reachability query shape against three tables: canon alone,
//    overlay (naive merge), overlay (corrected merge).
// ---------------------------------------------------------------------------

function reachabilitySql(table) {
  return `
    WITH RECURSIVE flag_edges AS (
      SELECT s.from_slug AS from_node, r.from_slug AS to_node, s.to_slug AS via_flag
      FROM ${table} s
      JOIN ${table} r
        ON r.edge_kind = 'requires_flag' AND r.to_type = s.to_type AND r.to_slug = s.to_slug
      WHERE s.edge_kind = 'sets_flag'
    ),
    reachable AS (
      SELECT s.from_slug AS node, ARRAY[s.from_slug] AS path, 0 AS depth
      FROM ${table} s
      WHERE s.edge_kind = 'sets_flag'
        AND NOT EXISTS (
          SELECT 1 FROM ${table} r
          WHERE r.edge_kind = 'requires_flag' AND r.from_slug = s.from_slug
        )
      UNION ALL
      SELECT fe.to_node, reachable.path || fe.to_node, reachable.depth + 1
      FROM reachable
      JOIN flag_edges fe ON fe.from_node = reachable.node
      WHERE NOT (fe.to_node = ANY(reachable.path))
    )
    SELECT DISTINCT node, min(depth) AS min_depth
    FROM reachable
    GROUP BY node
    ORDER BY min_depth, node
  `;
}

async function runReachability(label, table) {
  const { rows } = await client.query(reachabilitySql(table));
  console.log(`\n=== reachability: ${label} (${table}) ===`);
  console.log(`reachable node count: ${rows.length}`);
  const targets = [
    addEntity.entity_slug,
    "dialogue_vq_endings#vq_endings_start",
    "dialogue_vq_father#vq_father_start",
  ];
  for (const t of targets) {
    const hit = rows.find((r) => r.node === t);
    console.log(`  ${t}: ${hit ? `reachable, depth=${hit.min_depth}` : "NOT reachable"}`);
  }
  return rows;
}

const canonRows = await runReachability("canon alone", "spike_sc_s1.entity_edges");
const naiveRows = await runReachability("overlay, naive merge", `${SCHEMA}.overlay_naive_edges`);
const correctedRows = await runReachability("overlay, corrected merge", `${SCHEMA}.overlay_corrected_edges`);

console.log("\n=== diffs vs canon ===");
const canonSet = new Set(canonRows.map((r) => r.node));
const naiveSet = new Set(naiveRows.map((r) => r.node));
const correctedSet = new Set(correctedRows.map((r) => r.node));
console.log("naive overlay added:", [...naiveSet].filter((n) => !canonSet.has(n)));
console.log("naive overlay removed:", [...canonSet].filter((n) => !naiveSet.has(n)));
console.log("corrected overlay added:", [...correctedSet].filter((n) => !canonSet.has(n)));
console.log("corrected overlay removed:", [...canonSet].filter((n) => !correctedSet.has(n)));

await client.end();
