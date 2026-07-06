import fs from 'fs/promises';
import { glob } from 'glob';
import yaml from 'js-yaml';
import type { ContentType } from '@las-flores/shared';

// ---------------------------------------------------------------------------
// Content Quality Checks
// ---------------------------------------------------------------------------
// These are advisory checks that warn about common content issues.
// They never block migration — severity is always 'warning' (or 'error'
// only for genuine cross-reference mismatches that would break gameplay).

export interface QualityIssue {
  file?: string;
  contentId?: string;
  message: string;
  severity: 'warning' | 'error';
  checkType: 'density' | 'length' | 'inconsistency' | 'completeness';
}

export interface QualityReport {
  density: QualityIssue[];
  length: QualityIssue[];
  inconsistency: QualityIssue[];
  completeness: QualityIssue[];
}

function addIssue(
  issues: QualityIssue[],
  checkType: QualityIssue['checkType'],
  severity: QualityIssue['severity'],
  message: string,
  file?: string,
  contentId?: string,
) {
  issues.push({ checkType, severity, message, file, contentId });
}

// --- Helpers ----------------------------------------------------------------

interface LoadedContent {
  file: string;
  type: ContentType;
  data: any;
}

function getAllIds(data: any): string[] {
  const ids: string[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item.id === 'string') ids.push(item.id);
    }
  } else if (data && typeof data.id === 'string') {
    ids.push(data.id);
  }
  return ids;
}

function extractItems(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const key of ['characters', 'missions', 'stories', 'vault_items', 'gigs', 'shop_items', 'overlays', 'beats']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [data];
}

function getContentTypeFromPath(filePath: string): ContentType | null {
  const p = filePath.toLowerCase();
  if (p.includes('/characters/') || p.includes('\\characters\\')) return 'character';
  if (p.includes('/dialogues/') || p.includes('\\dialogues\\')) return 'dialogue';
  if (p.includes('/overlays/') || p.includes('\\overlays\\')) return 'overlay';
  if (p.includes('/scenes/') || p.includes('\\scenes\\')) return 'scene';
  if (p.includes('/gigs/') || p.includes('\\gigs\\') || p.includes('gigs.yaml')) return 'gig';
  if (p.includes('/locations/') || p.includes('\\locations\\')) return 'location';
  if (p.includes('/vault/') || p.includes('\\vault\\')) return 'vault';
  if (p.includes('/missions/') || p.includes('\\missions\\') || p.includes('/mysteries/') || p.includes('\\mysteries\\')) return 'mission';
  if (p.includes('/stories/') || p.includes('\\stories\\')) return 'story';
  if (p.includes('/shop/') || p.includes('\\shop\\')) return 'shop_item';
  if (p.includes('/maps/') || p.includes('\\maps\\')) return 'map_tile';
  if (p.endsWith('story_beats.yaml')) return 'story_beat';
  if (p.endsWith('.yaml') && p.includes('gig')) return 'gig';
  return null;
}

async function loadAllContent(contentDir: string): Promise<LoadedContent[]> {
  const allFiles = await glob(`${contentDir}/**/*.{yaml,yml}`, { absolute: true });
  const items: LoadedContent[] = [];

  for (const file of allFiles) {
    const contentType = getContentTypeFromPath(file);
    if (!contentType) continue;
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const data = yaml.load(raw);
      items.push({ file, type: contentType, data });
    } catch {
      // skip files that failed to parse
    }
  }
  return items;
}

// --- Density checks --------------------------------------------------------

function checkDensity(items: LoadedContent[], report: QualityReport) {
  const characters = new Map<string, { id: string; name: string; file: string }>();
  const scenes = new Map<string, { id: string; name: string; file: string; data: any }>();
  const dialogues = new Map<string, { id: string; name: string; file: string; data: any }>();
  const missions = new Map<string, { id: string; title: string; file: string }>();
  const vaultItems = new Map<string, { id: string; file: string; missionId?: string }>();

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      switch (item.type) {
        case 'character':
          characters.set(entry.id, { id: entry.id, name: entry.name, file: item.file });
          break;
        case 'scene':
          scenes.set(entry.id, { id: entry.id, name: entry.name, file: item.file, data: entry });
          break;
        case 'dialogue':
          dialogues.set(entry.id, { id: entry.id, name: entry.name, file: item.file, data: entry });
          break;
        case 'mission':
          missions.set(entry.id, { id: entry.id, title: entry.title, file: item.file });
          break;
        case 'vault':
          for (const vi of extractItems(entry)) {
            vaultItems.set(vi.id, { id: vi.id, file: item.file, missionId: vi.mission_id });
          }
          break;
      }
    }
  }

  for (const [, scene] of scenes) {
    const linked = scene.data?.available_dialogues;
    if (!linked || !Array.isArray(linked) || linked.length === 0) {
      addIssue(report.density, 'density', 'warning', `Scene "${scene.name}" has no linked dialogues`, scene.file, scene.id);
    }
  }

  for (const [, mission] of missions) {
    const linkedVault = [...vaultItems.values()].filter(v => v.missionId === mission.id);
    if (linkedVault.length === 0) {
      addIssue(report.density, 'density', 'warning', `Mission "${mission.title}" has no linked vault items`, mission.file, mission.id);
    }
  }

  for (const [, dialogue] of dialogues) {
    const nodeCount = dialogue.data?.nodes ? Object.keys(dialogue.data.nodes).length : 0;
    if (nodeCount < 3) {
      addIssue(report.density, 'density', 'warning', `Dialogue "${dialogue.name}" has only ${nodeCount} node(s) (recommend ≥3)`, dialogue.file, dialogue.id);
    }
  }

  const characterIdsUsed = new Set<string>();
  for (const [, scene] of scenes) {
    const npcs = scene.data?.metadata?.npcs;
    if (Array.isArray(npcs)) {
      for (const npcId of npcs) characterIdsUsed.add(npcId);
    }
  }
  for (const [, dialogue] of dialogues) {
    const nodes = dialogue.data?.nodes;
    if (nodes) {
      for (const node of Object.values(nodes as Record<string, any>)) {
        const speakerId = (node as any)?.speaker_id;
        if (speakerId) characterIdsUsed.add(speakerId);
      }
    }
  }
  for (const [charId, char] of characters) {
    if (!characterIdsUsed.has(charId)) {
      addIssue(report.density, 'density', 'warning', `Character "${char.name}" is not linked in any scene's NPCs`, char.file, charId);
    }
  }
}

// --- Length checks ----------------------------------------------------------

function checkNodeTextLength(nodeId: string, text: string, item: LoadedContent, entryId: string, report: QualityReport) {
  const len = text.length;
  if (len < 10) {
    addIssue(report.length, 'length', 'warning', `Dialogue node "${nodeId}" text is very short (${len} chars, recommend ≥10)`, item.file, entryId);
  } else if (len > 500) {
    addIssue(report.length, 'length', 'warning', `Dialogue node "${nodeId}" text is very long (${len} chars, recommend ≤500)`, item.file, entryId);
  }
}

function checkChoiceTextLength(nodeId: string, choice: any, item: LoadedContent, entryId: string, report: QualityReport) {
  const text = choice?.text;
  if (typeof text !== 'string') return;
  const len = text.length;
  if (len < 5) {
    addIssue(report.length, 'length', 'warning', `Choice text in node "${nodeId}" is very short (${len} chars, recommend ≥5)`, item.file, entryId);
  } else if (len > 100) {
    addIssue(report.length, 'length', 'warning', `Choice text in node "${nodeId}" is very long (${len} chars, recommend ≤100)`, item.file, entryId);
  }
}

function checkLength(items: LoadedContent[], report: QualityReport) {
  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      if (item.type === 'character' && entry.description) {
        const len = entry.description.length;
        if (len < 20) {
          addIssue(report.length, 'length', 'warning', `Character "${entry.name}" description is very short (${len} chars, recommend ≥20)`, item.file, entry.id);
        } else if (len > 300) {
          addIssue(report.length, 'length', 'warning', `Character "${entry.name}" description is very long (${len} chars, recommend ≤300)`, item.file, entry.id);
        }
      }

      if (item.type === 'scene' && entry.description) {
        const len = entry.description.length;
        if (len < 20) {
          addIssue(report.length, 'length', 'warning', `Scene "${entry.name}" description is very short (${len} chars, recommend ≥20)`, item.file, entry.id);
        } else if (len > 300) {
          addIssue(report.length, 'length', 'warning', `Scene "${entry.name}" description is very long (${len} chars, recommend ≤300)`, item.file, entry.id);
        }
      }

      if (item.type === 'dialogue' && entry.nodes) {
        for (const [nodeId, node] of Object.entries(entry.nodes as Record<string, any>)) {
          const text = (node as any)?.text;
          if (typeof text === 'string') checkNodeTextLength(nodeId, text, item, entry.id, report);
          const choices = (node as any)?.choices;
          if (Array.isArray(choices)) {
            for (const choice of choices) checkChoiceTextLength(nodeId, choice, item, entry.id, report);
          }
        }
      }
    }
  }
}

// --- Inconsistency checks ---------------------------------------------------

function checkInconsistency(items: LoadedContent[], report: QualityReport) {
  const allCharacterIds = new Set<string>();
  const allDialogueIds = new Set<string>();
  const allMissionIds = new Set<string>();

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      switch (item.type) {
        case 'character':
          for (const id of getAllIds(entry)) allCharacterIds.add(id);
          break;
        case 'dialogue':
          for (const id of getAllIds(entry)) allDialogueIds.add(id);
          break;
        case 'mission':
          for (const id of getAllIds(entry)) allMissionIds.add(id);
          break;
      }
    }
  }

  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      if (item.type === 'scene' && Array.isArray(entry.available_dialogues)) {
        for (const dialogueId of entry.available_dialogues) {
          if (!allDialogueIds.has(dialogueId)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Scene references non-existent dialogue "${dialogueId}"`, item.file, entry.id);
          }
        }
      }

      if (item.type === 'dialogue' && entry.nodes) {
        for (const [nodeId, node] of Object.entries(entry.nodes as Record<string, any>)) {
          const speakerId = (node as any)?.speaker_id;
          if (speakerId && !allCharacterIds.has(speakerId)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Dialogue node "${nodeId}" references non-existent speaker "${speakerId}"`, item.file, entry.id);
          }
        }
      }

      if (item.type === 'overlay' && entry.target_tree_id && !allDialogueIds.has(entry.target_tree_id)) {
        addIssue(report.inconsistency, 'inconsistency', 'error', `Overlay references non-existent target dialogue tree "${entry.target_tree_id}"`, item.file, entry.id);
      }

      if (item.type === 'overlay' && entry.mission_id && !allMissionIds.has(entry.mission_id)) {
        addIssue(report.inconsistency, 'inconsistency', 'error', `Overlay references non-existent mission "${entry.mission_id}"`, item.file, entry.id);
      }

      if (item.type === 'vault') {
        for (const vi of extractItems(entry)) {
          if (vi.mission_id && !allMissionIds.has(vi.mission_id)) {
            addIssue(report.inconsistency, 'inconsistency', 'error', `Vault item "${vi.id}" references non-existent mission "${vi.mission_id}"`, item.file, vi.id);
          }
        }
      }
    }
  }
}

// --- Completeness checks ----------------------------------------------------

function checkCompleteness(items: LoadedContent[], report: QualityReport) {
  for (const item of items) {
    for (const entry of extractItems(item.data)) {
      if (item.type === 'character') {
        if (!entry.portrait_urls || (Array.isArray(entry.portrait_urls) && entry.portrait_urls.length === 0)) {
          addIssue(report.completeness, 'completeness', 'warning', `Character "${entry.name}" has no portrait_urls`, item.file, entry.id);
        }
        if (!entry.lore_ref) {
          addIssue(report.completeness, 'completeness', 'warning', `Character "${entry.name}" has no lore_ref`, item.file, entry.id);
        }
      }

      if (item.type === 'scene') {
        if (!entry.background_url) {
          addIssue(report.completeness, 'completeness', 'warning', `Scene "${entry.name}" has no background_url`, item.file, entry.id);
        }
        if (!entry.mood) {
          addIssue(report.completeness, 'completeness', 'warning', `Scene "${entry.name}" has no mood set`, item.file, entry.id);
        }
      }

      if (item.type === 'mission' && (!entry.aftermath_payload || Object.keys(entry.aftermath_payload).length === 0)) {
        addIssue(report.completeness, 'completeness', 'warning', `Mission "${entry.title}" has no aftermath_payload`, item.file, entry.id);
      }

      if (item.type === 'overlay') {
        const hasModifications = entry.modifications && Array.isArray(entry.modifications) && entry.modifications.length > 0;
        const hasNodes = entry.nodes && Object.keys(entry.nodes).length > 0;
        if (!hasModifications && !hasNodes) {
          addIssue(report.completeness, 'completeness', 'warning', `Overlay "${entry.name}" has no modifications or nodes`, item.file, entry.id);
        }
      }
    }
  }
}

// --- Main entry point -------------------------------------------------------

export async function checkContentQuality(contentDir: string): Promise<QualityReport> {
  const items = await loadAllContent(contentDir);
  const report: QualityReport = {
    density: [],
    length: [],
    inconsistency: [],
    completeness: [],
  };

  checkDensity(items, report);
  checkLength(items, report);
  checkInconsistency(items, report);
  checkCompleteness(items, report);

  return report;
}
