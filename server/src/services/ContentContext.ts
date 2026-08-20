import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { queryContent } from '@las-flores/infra';
import { resolveContentDir } from './StoryBuilderLore.js';
import type { ExistingContentContext, ExistingLocation } from './types/LLMTypes.js';

function pathDistrict(file: string): string {
  const parts = file.split(path.sep);
  const index = parts.lastIndexOf('districts');
  return index >= 0 ? parts[index + 1] ?? '' : '';
}

/**
 * Build the existing-content grounding context used by LLM authoring passes.
 *
 * Isolated in its own module (depending only on `queryContent` and the
 * file-based content reader) so both `ContentPlanService` and the
 * `LLMProvider` implementations can reuse it without forming an import cycle
 * (provider → ContentPlanService → LLMService → provider). All DB reads here
 * are content-entity reads, so the dedicated read-only content pool is used
 * (per AGENTS.md database/cache patterns) rather than the gameplay OLTP pool.
 */
export async function gatherExistingContentContext(): Promise<ExistingContentContext> {
  const [characters, scenes, dialogues, missions, overlays, locations] = await Promise.all([
    queryContent<{ id: string; name: string; role?: string; faction?: string; personality?: string; description?: string }>('SELECT id, name, metadata->>\'role\' as role, metadata->>\'faction\' as faction, metadata->>\'personality\' as personality, description FROM characters ORDER BY name ASC'),
    queryContent<{ id: string; name: string; district: string; mood?: string; description?: string }>(
      `SELECT s.id, s.name, COALESCE(d.name, '') AS district, s.mood, s.description
       FROM scenes s LEFT JOIN districts d ON d.id = s.district_id
       ORDER BY s.name ASC`,
    ),
    queryContent<{ id: string; name: string }>('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
    queryContent<{ id: string; title: string; description?: string }>('SELECT id, title, description FROM mysteries ORDER BY title ASC'),
    queryContent<{ id: string; name: string }>('SELECT id, name FROM dialogue_overlays ORDER BY name ASC'),
    gatherLocationContext(),
  ]);

  return {
    characters: characters.rows,
    scenes: scenes.rows,
    dialogues: dialogues.rows,
    missions: missions.rows,
    overlays: overlays.rows,
    locations,
  };
}

/**
 * Load existing location context from the file-based content store.
 * Locations are a YAML content type under content/districts/<district>/locations/
 * — there is no `locations` DB table — so we read them directly from disk
 * (mirrors ContentPlanService.gatherLocationContext).
 */
export async function gatherLocationContext(): Promise<ExistingLocation[]> {
  const contentDir = resolveContentDir();
  try {
    const files = await glob(`${contentDir}/districts/*/locations/*/*.yaml`, { absolute: true });

    // District display names (e.g. "South") live in the `districts` table and
    // are what the scenes query returns (d.name). When a location YAML omits a
    // `district` field we infer it from the directory slug; resolve that slug
    // to its display name so locations and scenes share one district
    // representation for any consumer that matches them by district.
    // District-name enrichment is best-effort: if the lookup fails, keep the
    // slug fallbacks below rather than discarding every readable location.
    let districtNameBySlug = new Map<string, string>();
    try {
      const districtRows = await queryContent<{ slug: string; name: string }>(
        `SELECT slug, name FROM districts`
      );
      districtNameBySlug = new Map<string, string>();
      for (const row of districtRows.rows) {
        districtNameBySlug.set(row.slug, row.name);
        // Multiword district folders use underscores (e.g. `los_andes`) while
        // database slugs use hyphens (e.g. `los-andes`); index both forms so
        // the directory fallback resolves regardless of separator convention.
        districtNameBySlug.set(row.slug.replace(/-/g, '_'), row.name);
      }
    } catch (err) {
      console.warn('[content-context] District name lookup failed; using slug fallbacks:', err);
    }

    const out: ExistingLocation[] = [];
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const data: any = yaml.load(raw);
        if (!data || typeof data !== 'object' || !data.id) continue;
        const inferredSlug = pathDistrict(file);
        const district = data.district
          ? String(data.district)
          : (districtNameBySlug.get(inferredSlug) ??
            districtNameBySlug.get(inferredSlug.replace(/_/g, '-')) ??
            inferredSlug);
        out.push({
          id: String(data.id),
          name: String(data.name ?? ''),
          district,
          daytime: data.daytime ? String(data.daytime) : undefined,
          nightlife: data.nightlife ? String(data.nightlife) : undefined,
          history: data.history ? String(data.history) : undefined,
        });
      } catch {
        // skip files that fail to parse
      }
    }
    return out;
  } catch (error) {
    console.warn('[content-context] Failed to load location context:', error);
    return [];
  }
}
