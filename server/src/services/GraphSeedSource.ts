// ============================================================
// GraphSeedSourceTMP — gather canonical content for the base graph
//
// Produces the `:Content` base graph nodes + FK edges from the migrated content
// store: node fields from the DB tables (the migrated, canonical form of
// content/ YAML) plus Location YAML (no `locations` DB table exists), and edges
// from the relational FKs. Single source for the M27 seed CLI + integration test.
//
// Node sources:
//   Character  <- characters            (name + role/faction/personality/description)
//   Scene      <- scenes JOIN districts (name + district/mood/description)
//   Dialogue   <- dialogue_trees        (name)
//   Mission    <- mysteries             (title->name + description)
//   Overlay    <- dialogue_overlays     (name)
//   Location   <- content/districts/*/locations/*/*.yaml  (no DB table)
//   District   <- districts             (name + slug/description)
// ============================================================

import fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { queryOLTP } from '@las-flores/infra';
import type { GraphEdge } from '@las-flores/shared';
import type { BaseContentNodeInput } from './GraphBaseService.js';
import { resolveContentDir } from './StoryBuilderLore.js';

export interface BaseGraphData {
  nodes: BaseContentNodeInput[];
  edges: GraphEdge[];
}

function truthy(value: unknown): string | undefined {
  const s = value == null ? '' : String(value);
  return s.length > 0 ? s : undefined;
}

async function gatherCharacters(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT id, name, COALESCE(title, '') AS title,
            COALESCE(metadata->>'role', '') AS role,
            COALESCE(metadata->>'faction', '') AS faction,
            COALESCE(metadata->>'personality', '') AS personality,
            COALESCE(description, '') AS description
     FROM characters ORDER BY name ASC`,
  );
  return result.rows.map((row) => {
    const canonicalFields: Record<string, unknown> = {};
    for (const key of ['title', 'role', 'faction', 'personality', 'description'] as const) {
      const v = truthy(row[key]);
      if (v) canonicalFields[key] = v;
    }
    return { nodeType: 'Character', nodeId: String(row.id), name: truthy(row.name) ?? '', canonicalFields };
  });
}

async function gatherDistricts(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT id, name, COALESCE(slug, '') AS slug, COALESCE(description, '') AS description
     FROM districts ORDER BY name ASC`,
  );
  return result.rows.map((row) => {
    const canonicalFields: Record<string, unknown> = {};
    const slug = truthy(row.slug);
    const description = truthy(row.description);
    if (slug) canonicalFields.slug = slug;
    if (description) canonicalFields.description = description;
    return { nodeType: 'District', nodeId: String(row.id), name: truthy(row.name) ?? '', canonicalFields };
  });
}

async function gatherScenes(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT s.id, s.name, COALESCE(d.name, '') AS district,
            COALESCE(s.mood, '') AS mood, COALESCE(s.description, '') AS description
     FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
     ORDER BY s.name ASC`,
  );
  return result.rows.map((row) => {
    const canonicalFields: Record<string, unknown> = {};
    const district = truthy(row.district);
    const mood = truthy(row.mood);
    const description = truthy(row.description);
    if (district) canonicalFields.district = district;
    if (mood) canonicalFields.mood = mood;
    if (description) canonicalFields.description = description;
    return { nodeType: 'Scene', nodeId: String(row.id), name: truthy(row.name) ?? '', canonicalFields };
  });
}

async function gatherDialogues(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT id, name FROM dialogue_trees ORDER BY name ASC`,
  );
  return result.rows.map((row) => ({
    nodeType: 'Dialogue',
    nodeId: String(row.id),
    name: truthy(row.name) ?? '',
    canonicalFields: {},
  }));
}

async function gatherMissions(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT id, title, COALESCE(description, '') AS description FROM mysteries ORDER BY title ASC`,
  );
  return result.rows.map((row) => {
    const canonicalFields: Record<string, unknown> = {};
    const description = truthy(row.description);
    if (description) canonicalFields.description = description;
    return { nodeType: 'Mission', nodeId: String(row.id), name: truthy(row.title) ?? '', canonicalFields };
  });
}

async function gatherOverlays(): Promise<BaseContentNodeInput[]> {
  const result = await queryOLTP<Record<string, unknown>>(
    `SELECT id, name FROM dialogue_overlays ORDER BY name ASC`,
  );
  return result.rows.map((row) => ({
    nodeType: 'Overlay',
    nodeId: String(row.id),
    name: truthy(row.name) ?? '',
    canonicalFields: {},
  }));
}

/** Locations live only in YAML, under each district's locations/ folder. */
async function gatherLocations(): Promise<BaseContentNodeInput[]> {
  const contentDir = resolveContentDir();
  const out: BaseContentNodeInput[] = [];
  try {
    const files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const data: any = yaml.load(raw);
        if (!data || typeof data !== 'object' || !data.id) continue;
        const canonicalFields: Record<string, unknown> = {};
        for (const key of ['district', 'daytime', 'nightlife', 'history'] as const) {
          const v = truthy(data[key]);
          if (v) canonicalFields[key] = v;
        }
        out.push({ nodeType: 'Location', nodeId: String(data.id), name: truthy(data.name) ?? '', canonicalFields });
      } catch {
        // skip files that fail to parse
      }
    }
  } catch {
    // content dir unreadable — return what we have
  }
  return out;
}

// ---- edges (FK-derived) ----

async function gatherDialogueOwnershipEdges(): Promise<GraphEdge[]> {
  const result = await queryOLTP<{ dialogue_id: string; character_id?: string; scene_id?: string; mission_id?: string }>(
    `SELECT id AS dialogue_id, character_id, scene_id, mission_id
     FROM dialogue_trees
     WHERE character_id IS NOT NULL OR scene_id IS NOT NULL OR mission_id IS NOT NULL`,
  );
  const edges: GraphEdge[] = [];
  for (const row of result.rows) {
    if (row.character_id) edges.push({ sourceNodeType: 'Dialogue', sourceNodeId: row.dialogue_id, targetNodeType: 'Character', targetNodeId: row.character_id, type: 'OWNED_BY' });
    if (row.scene_id) edges.push({ sourceNodeType: 'Dialogue', sourceNodeId: row.dialogue_id, targetNodeType: 'Scene', targetNodeId: row.scene_id, type: 'SET_IN' });
    if (row.mission_id) edges.push({ sourceNodeType: 'Dialogue', sourceNodeId: row.dialogue_id, targetNodeType: 'Mission', targetNodeId: row.mission_id, type: 'SERVES' });
  }
  return edges;
}

async function gatherOverlayEdges(): Promise<GraphEdge[]> {
  const result = await queryOLTP<{ overlay_id: string; target_tree_id?: string; mystery_id?: string }>(
    `SELECT id AS overlay_id, target_tree_id, mystery_id FROM dialogue_overlays
     WHERE target_tree_id IS NOT NULL OR mystery_id IS NOT NULL`,
  );
  const edges: GraphEdge[] = [];
  for (const row of result.rows) {
    if (row.target_tree_id) edges.push({ sourceNodeType: 'Overlay', sourceNodeId: row.overlay_id, targetNodeType: 'Dialogue', targetNodeId: row.target_tree_id, type: 'OVERLAYS' });
    if (row.mystery_id) edges.push({ sourceNodeType: 'Overlay', sourceNodeId: row.overlay_id, targetNodeType: 'Mission', targetNodeId: row.mystery_id, type: 'SERVES' });
  }
  return edges;
}

async function gatherSceneEdges(): Promise<GraphEdge[]> {
  const districtResult = await queryOLTP<{ scene_id: string; district_id?: string }>(
    `SELECT id AS scene_id, district_id FROM scenes WHERE district_id IS NOT NULL`,
  );
  const sceneEdges: GraphEdge[] = districtResult.rows.map((row) => ({
    sourceNodeType: 'Scene',
    sourceNodeId: row.scene_id,
    targetNodeType: 'District',
    targetNodeId: String(row.district_id),
    type: 'IN_DISTRICT',
  }));

  const sceneCharResult = await queryOLTP<{ scene_id: string; character_id: string }>(
    `SELECT scene_id, character_id FROM scene_characters`,
  );
  for (const row of sceneCharResult.rows) {
    sceneEdges.push({ sourceNodeType: 'Scene', sourceNodeId: row.scene_id, targetNodeType: 'Character', targetNodeId: row.character_id, type: 'HAS_CHARACTER' });
    sceneEdges.push({ sourceNodeType: 'Character', sourceNodeId: row.character_id, targetNodeType: 'Scene', targetNodeId: row.scene_id, type: 'APPEARS_IN' });
  }
  return sceneEdges;
}

/** Gather the full base graph (nodes + FK edges) from the migrated content store. */
export async function gatherBaseGraphData(): Promise<BaseGraphData> {
  const [characters, districts, scenes, dialogues, missions, overlays, locNodes] = await Promise.all([
    gatherCharacters(),
    gatherDistricts(),
    gatherScenes(),
    gatherDialogues(),
    gatherMissions(),
    gatherOverlays(),
    gatherLocations(),
  ]);
  const [dialogueEdges, overlayEdges, sceneEdges] = await Promise.all([
    gatherDialogueOwnershipEdges(),
    gatherOverlayEdges(),
    gatherSceneEdges(),
  ]);
  return {
    nodes: [...characters, ...districts, ...scenes, ...dialogues, ...missions, ...overlays, ...locNodes],
    edges: [...dialogueEdges, ...overlayEdges, ...sceneEdges],
  };
}

/** Node counts per nodeType (diagnostic summary). */
export async function summarizeBaseGraphSource(): Promise<Record<string, number>> {
  const data = await gatherBaseGraphData();
  const byType: Record<string, number> = {};
  for (const node of data.nodes) {
    byType[node.nodeType] = (byType[node.nodeType] ?? 0) + 1;
  }
  return byType;
}
