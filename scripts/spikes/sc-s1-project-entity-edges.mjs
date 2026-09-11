#!/usr/bin/env node
// SC-S1 spike: project an entity_edges-shaped table from existing content.
// Throwaway script. Scratch schema, dropped/recreated on every run — see README.
//
// Usage: DATABASE_URL=postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores \
//        node scripts/spikes/sc-s1-project-entity-edges.mjs

import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT = path.join(ROOT, "content");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores";

const SCHEMA = "spike_sc_s1";

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------

function readYaml(filePath) {
  return loadYaml(fs.readFileSync(filePath, "utf8"));
}

function findFiles(dir, matcher) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findFiles(full, matcher));
    } else if (matcher(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const characterFiles = findFiles(path.join(CONTENT, "characters"), (n) =>
  n.startsWith("char_") && n.endsWith(".yaml"),
);
const dialogueFiles = findFiles(path.join(CONTENT, "dialogues"), (n) =>
  n.endsWith(".yaml"),
);
const sceneFiles = findFiles(path.join(CONTENT, "scenes"), (n) =>
  n.startsWith("scene_") && n.endsWith(".yaml"),
);
const missionFiles = findFiles(path.join(CONTENT, "missions"), (n) =>
  n.startsWith("mission_") && n.endsWith(".yaml"),
);
const districtDirs = fs
  .readdirSync(path.join(CONTENT, "districts"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// slug = folder name, matches how every other content type is addressed on disk
function slugOf(filePath) {
  return path.basename(path.dirname(filePath));
}

const characters = characterFiles.map((f) => ({
  slug: slugOf(f),
  file: f,
  data: readYaml(f),
}));
const charById = new Map(characters.map((c) => [c.data.id, c]));

const scenes = sceneFiles.map((f) => ({
  slug: slugOf(f),
  file: f,
  data: readYaml(f),
}));
const sceneById = new Map(scenes.map((s) => [s.data.id, s]));

const dialogues = dialogueFiles.map((f) => ({
  slug: path.basename(f, ".yaml"),
  file: f,
  data: readYaml(f),
}));
const dialogueById = new Map(dialogues.map((d) => [d.data.id, d]));

const NULL_SCENE_ID = "00000000-0000-0000-0000-000000000000";

// district slug normalization: scene.district is a human title
// ("South Las Flores", "Los Andes"); district folders are snake_case slugs
// ("south", "los_andes"). No declared mapping exists in content/ itself —
// this normalizer is the spike's own guess, built by hand against the
// 13 folder names, and that hand-mapping *is* one of the findings.
const DISTRICT_TITLE_TO_SLUG = new Map([
  ["central", "central"],
  ["city", "city"],
  ["far south", "far_south"],
  ["industrial", "industrial"],
  ["los andes", "los_andes"],
  ["north", "north"],
  ["northeast", "northeast"],
  ["pacific", "pacific"],
  ["port", "port"],
  ["south", "south"],
  ["southeast", "southeast"],
  // seen in scene data, no matching district folder:
  // "south las flores", "universidad del valle"
]);

function resolveDistrictSlug(title) {
  if (!title) return { slug: null, matched: false };
  const key = title.trim().toLowerCase();
  const slug = DISTRICT_TITLE_TO_SLUG.get(key);
  if (slug && districtDirs.includes(slug)) return { slug, matched: true };
  return { slug: null, matched: false, raw: title };
}

// ---------------------------------------------------------------------------
// Project edges
// ---------------------------------------------------------------------------

const edges = [];
const unresolved = { district_titles: new Set(), speaker_ids: new Set() };

function addEdge(from_type, from_slug, edge_kind, to_type, to_slug, attrs = {}) {
  edges.push({ from_type, from_slug, edge_kind, to_type, to_slug, attrs });
}

// characters -> faction (metadata.faction is a bare slug-like string, no
// faction entity file exists anywhere in content/ — "to_type: faction" is
// this script's own invention, not a real content type)
for (const c of characters) {
  const faction = c.data.metadata?.faction;
  if (faction) {
    addEdge("character", c.slug, "affiliated_with", "faction", faction, {});
  }
}

// scenes -> district (located_in), via the hand-built title->slug map above
for (const s of scenes) {
  const title = s.data.district;
  const { slug, matched, raw } = resolveDistrictSlug(title);
  if (matched) {
    addEdge("scene", s.slug, "located_in", "district", slug, {});
  } else if (raw) {
    unresolved.district_titles.add(raw);
  }
}

// scenes -> dialogues (available_dialogues is a list of dialogue UUIDs)
for (const s of scenes) {
  const list = s.data.available_dialogues || [];
  for (const dialogueId of list) {
    const d = dialogueById.get(dialogueId);
    if (d) {
      addEdge("scene", s.slug, "offers_dialogue", "dialogue", d.slug, {});
    }
  }
}

// dialogues -> scene (scene_id field; "00000000..." is a documented null
// placeholder, not a real scene reference — must be filtered by hand)
for (const d of dialogues) {
  const sceneId = d.data.scene_id;
  if (sceneId && sceneId !== NULL_SCENE_ID) {
    const s = sceneById.get(sceneId);
    if (s) addEdge("dialogue", d.slug, "located_in", "scene", s.slug, {});
  }
}

// dialogues -> character (top-level character_id field, only present on
// some per-character dialogue files, e.g. *_endings.yaml)
for (const d of dialogues) {
  const charId = d.data.character_id;
  if (charId) {
    const c = charById.get(charId);
    if (c) addEdge("dialogue", d.slug, "scene_participant", "character", c.slug, {});
  }
}

// dialogue nodes -> character (per-node speaker_id — the more granular,
// more frequently populated source of scene_participant edges)
for (const d of dialogues) {
  const nodes = d.data.nodes || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.speaker_id) {
      const c = charById.get(node.speaker_id);
      if (c) {
        addEdge("dialogue", d.slug, "scene_participant", "character", c.slug, {
          node_id: nodeId,
        });
      } else {
        unresolved.speaker_ids.add(node.speaker_id);
      }
    }
  }
}

// dialogue nodes -> flags (flag_set effects; sets_flag)
for (const d of dialogues) {
  const nodes = d.data.nodes || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const flagSet = node.effects?.flag_set;
    if (flagSet && typeof flagSet === "object") {
      for (const [flagName, value] of Object.entries(flagSet)) {
        addEdge("dialogue_node", `${d.slug}#${nodeId}`, "sets_flag", "flag", flagName, {
          value,
        });
      }
    }
  }
}

// dialogue node choices -> flags (required_flags gate; requires_flag)
for (const d of dialogues) {
  const nodes = d.data.nodes || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const choice of node.choices || []) {
      const required = choice.required_flags;
      if (required && typeof required === "object") {
        for (const [flagName, value] of Object.entries(required)) {
          addEdge(
            "dialogue_node",
            `${d.slug}#${nodeId}`,
            "requires_flag",
            "flag",
            flagName,
            { value, choice_id: choice.id },
          );
        }
      }
    }
  }
}

// dialogue node choices -> vault item (vault_unlock; gives_item)
for (const d of dialogues) {
  const nodes = d.data.nodes || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const choice of node.choices || []) {
      if (choice.vault_unlock) {
        addEdge(
          "dialogue_node",
          `${d.slug}#${nodeId}`,
          "gives_item",
          "vault_item",
          choice.vault_unlock,
          { choice_id: choice.id },
        );
      }
    }
  }
}

// mission -> scene (mission_scene): attempted, see findings — the mission
// payload (content/missions/**/mission_*.yaml) carries no scene, character,
// or district references at all, only prose description + aftermath_payload
// stub arrays. No mission_scene edges can be projected from it as authored.
for (const f of missionFiles) {
  const data = readYaml(f);
  for (const mission of data.missions || []) {
    void mission; // no structured scene/character/location reference exists
  }
}

// ---------------------------------------------------------------------------
// Report + load
// ---------------------------------------------------------------------------

const edgeKindCounts = edges.reduce((acc, e) => {
  acc[e.edge_kind] = (acc[e.edge_kind] || 0) + 1;
  return acc;
}, {});

console.log("=== SC-S1 projection summary ===");
console.log(`characters: ${characters.length}, dialogues: ${dialogues.length}, scenes: ${scenes.length}, missions: ${missionFiles.length}, districts: ${districtDirs.length}`);
console.log(`total edges projected: ${edges.length}`);
console.log("edge_kind distribution:", edgeKindCounts);
console.log(`unresolved district titles (no slug match): ${[...unresolved.district_titles].join(", ") || "none"}`);
console.log(`unresolved speaker_ids (no character match): ${unresolved.speaker_ids.size}`);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await client.query(`CREATE SCHEMA ${SCHEMA}`);
await client.query(`
  CREATE TABLE ${SCHEMA}.entity_edges (
    id SERIAL PRIMARY KEY,
    from_type TEXT NOT NULL,
    from_slug TEXT NOT NULL,
    edge_kind TEXT NOT NULL,
    to_type TEXT NOT NULL,
    to_slug TEXT NOT NULL,
    attrs JSONB NOT NULL DEFAULT '{}'::jsonb
  )
`);

const insertText = `
  INSERT INTO ${SCHEMA}.entity_edges (from_type, from_slug, edge_kind, to_type, to_slug, attrs)
  VALUES ($1, $2, $3, $4, $5, $6)
`;
for (const e of edges) {
  await client.query(insertText, [
    e.from_type,
    e.from_slug,
    e.edge_kind,
    e.to_type,
    e.to_slug,
    JSON.stringify(e.attrs),
  ]);
}

await client.query(`
  CREATE INDEX entity_edges_from_idx ON ${SCHEMA}.entity_edges (from_type, from_slug);
`);
await client.query(`
  CREATE INDEX entity_edges_to_idx ON ${SCHEMA}.entity_edges (to_type, to_slug);
`);
await client.query(`
  CREATE INDEX entity_edges_kind_idx ON ${SCHEMA}.entity_edges (edge_kind);
`);

const { rows: countRows } = await client.query(
  `SELECT count(*)::int AS n FROM ${SCHEMA}.entity_edges`,
);
const { rows: sizeRows } = await client.query(`
  SELECT
    pg_size_pretty(pg_total_relation_size('${SCHEMA}.entity_edges')) AS total_size,
    pg_size_pretty(pg_relation_size('${SCHEMA}.entity_edges')) AS table_size,
    pg_size_pretty(pg_indexes_size('${SCHEMA}.entity_edges')) AS indexes_size
`);
const { rows: kindRows } = await client.query(`
  SELECT edge_kind, count(*)::int AS n
  FROM ${SCHEMA}.entity_edges
  GROUP BY edge_kind
  ORDER BY n DESC
`);

console.log("\n=== Postgres load result ===");
console.log(`row count in table: ${countRows[0].n}`);
console.log("sizes:", sizeRows[0]);
console.log("edge_kind counts (from table):");
for (const r of kindRows) console.log(`  ${r.edge_kind}: ${r.n}`);

await client.end();
