import type { ContentType } from '@las-flores/shared';

export function extractContentIds(contentType: ContentType, data: Record<string, unknown>): string[] {
  switch (contentType) {
    case 'mission':
      return ((data.missions as Array<{ id: string }>) || [data as { id: string }]).map((item) => item.id);
    case 'story':
      if (data.beats) {
        return (data.beats as Array<{ slug: string }>).map((item) => item.slug);
      }
      return (data as { id?: string }).id ? [(data as { id: string }).id] : [];
    case 'vault':
      return ((data.vault_items as Array<{ id: string }>) || []).map((item) => item.id);
    case 'gig':
      return ((data.gigs as Array<{ id: string }>) || [data as { id: string }]).map((item) => item.id);
    case 'shop_item':
      return ((data.shop_items as Array<{ id: string }>) || []).map((item) => item.id);
    case 'story_beat':
      // story_beat uses slug as PK — return slugs instead of UUIDs
      if (data.beats) {
        return (data.beats as Array<{ slug: string }>).map((item) => item.slug);
      }
      // Individual beat file: { id, name, description, metadata }
      if (data.id && typeof data.id === 'string') {
        return [data.id];
      }
      return [];
    default:
      return [(data as { id: string }).id];
  }
}

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
  if (normalizedPath.includes('/locations/') || normalizedPath.includes('\\locations\\')) {
    return 'location';
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
  if (normalizedPath.includes('/maps/') || normalizedPath.includes('\\maps\\')) {
    return 'map_tile';
  }

  if (normalizedPath.endsWith('story_beats.yaml') || normalizedPath.includes('/story_beats/') || normalizedPath.includes('\\story_beats\\')) {
    return 'story_beat';
  }

  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }

  return null;
}

export function getProcessingOrder(files: string[]): string[] {
  const order: ContentType[] = ['story_beat', 'character', 'scene', 'location', 'mission', 'vault', 'dialogue', 'overlay', 'gig', 'shop_item', 'map_tile', 'story'];

  return files.sort((a, b) => {
    const typeA = getContentTypeFromPath(a);
    const typeB = getContentTypeFromPath(b);

    if (!typeA || !typeB) return 0;

    const indexA = order.indexOf(typeA);
    const indexB = order.indexOf(typeB);

    return indexA - indexB;
  });
}
