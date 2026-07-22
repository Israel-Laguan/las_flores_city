import {
  YAMLCharacterSchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLSceneSchema,
  YAMLMissionSchema,
  YAMLLocationSchema,
  VaultFileSchema,
  ShopItemFileSchema,
  GigFileSchema,
  StoryBeatRegistrySchema,
  ContentType,
  YAMLStoryFileSchema,
} from '@las-flores/shared';
import type { ValidationResult, ValidationError } from './validate.js';

export function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) {
    return 'character';
  }
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) {
    return 'dialogue';
  }
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) {
    return 'overlay';
  }
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) {
    return 'scene';
  }
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) {
    return 'gig';
  }
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) {
    return 'vault';
  }
  if (normalizedPath.includes('/missions/') || normalizedPath.includes('\\missions\\') || normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) {
    return 'mission';
  }
  if (normalizedPath.includes('/stories/') || normalizedPath.includes('\\stories\\')) {
    return 'story';
  }
  if (normalizedPath.includes('/shop/') || normalizedPath.includes('\\shop\\')) {
    return 'shop_item';
  }
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) {
    return 'location';
  }

  if (normalizedPath.endsWith('story_beats.yaml') || normalizedPath.includes('/story_beats/') || normalizedPath.includes('\\story_beats\\')) {
    return 'story_beat';
  }

  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }

  return null;
}

export function validateContentByType(type: ContentType, data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    switch (type) {
      case 'character':
        YAMLCharacterSchema.parse(data);
        break;
      case 'dialogue':
        YAMLDialogueSchema.parse(data);
        const cycleErrors = detectCycles(data.nodes || {});
        errors.push(...cycleErrors);
        break;
      case 'overlay':
        YAMLOverlaySchema.parse(data);
        break;
      case 'mission':
        if (data.missions) {
          for (const mission of data.missions) {
            YAMLMissionSchema.parse(mission);
          }
        } else {
          YAMLMissionSchema.parse(data);
        }
        break;
      case 'story':
        if (data.stories) {
          YAMLStoryFileSchema.parse(data);
        } else if (data.beats) {
          // Story file with beats-based format — validate basic fields
          if (!data.id || typeof data.id !== 'string') {
            errors.push({ message: 'Story must have an id field', severity: 'error' });
          }
          if (!data.name || typeof data.name !== 'string') {
            errors.push({ message: 'Story must have a name field', severity: 'error' });
          }
        } else {
          YAMLStoryFileSchema.parse(data);
        }
        break;
      case 'scene':
        YAMLSceneSchema.parse(data);
        break;
      case 'vault':
        VaultFileSchema.parse(data);
        break;
      case 'shop_item':
        ShopItemFileSchema.parse(data);
        break;
      case 'gig':
        GigFileSchema.parse(data);
        break;
      case 'location':
        YAMLLocationSchema.parse(data);
        break;
      case 'story_beat':
        if (data.beats) {
          StoryBeatRegistrySchema.parse(data);
        } else {
          // Individual story beat file — validate basic fields
          if (!data.id || typeof data.id !== 'string') {
            errors.push({ message: 'Story beat must have an id field', severity: 'error' });
          }
          if (!data.name || typeof data.name !== 'string') {
            errors.push({ message: 'Story beat must have a name field', severity: 'error' });
          }
        }
        break;
      case 'map_tile':
        break;
    }
  } catch (e: any) {
    errors.push({
      message: `Schema validation failed: ${e.message}`,
      severity: 'error',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function detectCycles(nodes: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return false;

    if (node.choices) {
      for (const choice of node.choices) {
        if (!visited.has(choice.next_node_id)) {
          if (dfs(choice.next_node_id)) {
            return true;
          }
        } else if (recursionStack.has(choice.next_node_id)) {
          errors.push({
            message: `Circular dependency detected: ${nodeId} -> ${choice.next_node_id}`,
            severity: 'error',
          });
          return true;
        }
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return errors;
}
