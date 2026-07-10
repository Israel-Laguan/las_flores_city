import yaml from 'js-yaml';
import type { ContentPlanItem, ContentType } from '@las-flores/shared';

type TemplateFn = (item: ContentPlanItem) => string;

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'untitled';
}

const YAML_OPTIONS = { lineWidth: -1, noRefs: true };

const TEMPLATES: Record<ContentType, TemplateFn> = {
  character: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      name: item.name,
      title: item.fields.title || 'TODO: Add title',
      description: item.fields.description || 'TODO: Add description',
      metadata: {
        type: item.fields.metadata?.type || 'human',
        role: item.fields.metadata?.role || 'npc',
        faction: item.fields.metadata?.faction || 'TODO: Add faction',
        personality: item.fields.metadata?.personality || 'TODO: Add personality',
      },
      lore_path: `figures/${slug}/${slug}.md`,
      narrative_path: `characters/char_${slug}.md`,
    }, YAML_OPTIONS);
  },

  dialogue: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      name: item.name,
      description: item.fields.description || 'TODO: Add description',
      start_node_id: 'start',
      nodes: {
        start: {
          id: 'start',
          type: 'narrator',
          text: item.fields.text || 'TODO: Add dialogue text',
          choices: [
            {
              id: 'continue',
              text: 'Continue',
              next_node_id: 'end',
            },
          ],
        },
        end: {
          id: 'end',
          type: 'narrator',
          text: 'TODO: Add ending text',
          is_end: true,
        },
      },
      lore_path: `figures/${slug}/${slug}.md`,
    }, YAML_OPTIONS);
  },

  scene: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      name: item.name,
      description: item.fields.description || 'TODO: Add description',
      district: item.fields.district || 'TODO: Add district',
      district_lore: item.fields.district_lore || item.fields.district || 'TODO: Add district lore',
      district_subzone: item.fields.district_subzone || item.fields.district || 'TODO: Add district subzone',
      mood: item.fields.mood || 'TODO: Add mood',
      available_dialogues: [],
      lore_path: `landmarks/${slug}.md`,
    }, YAML_OPTIONS);
  },

  overlay: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      name: item.name,
      description: item.fields.description || 'TODO: Add description',
      target_tree_id: item.fields.target_tree_id || 'TODO: Add target dialogue tree UUID',
      modifications: [],
      lore_path: `stories/${slug}.md`,
    }, YAML_OPTIONS);
  },

  mission: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      title: item.name,
      description: item.fields.description || 'TODO: Add description',
      status: 'ACTIVE',
      lore_path: `stories/${slug}.md`,
    }, YAML_OPTIONS);
  },

  story: (item) => yaml.dump({
    id: item.id,
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    beats: item.fields.beats || [],
  }, YAML_OPTIONS),

  shop_item: (item) => yaml.dump({
    id: item.id,
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    price: item.fields.price || 0,
    currency: item.fields.currency || 'credits',
  }, YAML_OPTIONS),

  location: (item) => {
    const slug = sanitizeSlug(item.slug);
    return yaml.dump({
      id: item.id,
      type: 'location',
      name: item.name,
      description: item.fields.description || 'TODO: Add description',
      district: item.fields.district || 'TODO: Add district',
      tags: item.fields.tags || [],
      history: item.fields.history || 'TODO: Add history',
      daytime: item.fields.daytime || 'TODO: Add daytime description',
      nightlife: item.fields.nightlife || 'TODO: Add nightlife description',
      important_places: item.fields.important_places || [],
      lore_path: `landmarks/${slug}.md`,
    }, YAML_OPTIONS);
  },

  map_tile: (item) => yaml.dump({
    id: item.id,
    district_id: item.fields.district_id || 'TODO: Add district UUID',
    x: item.fields.x || 0,
    y: item.fields.y || 0,
    terrain_type: item.fields.terrain_type || 'TODO: Add terrain type',
  }, YAML_OPTIONS),

  story_beat: (item) => yaml.dump({
    id: item.id,
    description: item.fields.description || 'TODO: Add description',
  }, YAML_OPTIONS),

  gig: (item) => yaml.dump({
    id: item.id,
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    reward: item.fields.reward || 'TODO: Add reward',
  }, YAML_OPTIONS),

  vault: (item) => yaml.dump({
    id: item.id,
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    item_type: item.fields.item_type || 'TODO: Add item type',
  }, YAML_OPTIONS),
};

export function generateYaml(item: ContentPlanItem): string {
  const template = TEMPLATES[item.type];
  if (!template) {
    throw new Error(`No template found for content type: ${item.type}`);
  }
  return template(item);
}

export function resolveFilePath(item: ContentPlanItem): string {
  if (item.type === 'story_beat') {
    return 'story_beats.yaml';
  }

  if (!/^[a-z0-9_]+$/.test(item.slug)) {
    throw new Error(`Invalid slug: ${item.slug}`);
  }

  const dirMap: Record<ContentType, string> = {
    character: 'characters',
    dialogue: 'dialogues',
    scene: 'scenes',
    overlay: 'overlays',
    mission: 'missions',
    story: 'stories',
    story_beat: 'story_beats',
    shop_item: 'shop',
    location: 'locations',
    map_tile: 'maps',
    gig: 'gigs',
    vault: 'vault',
  };

  const dir = dirMap[item.type];
  if (!dir) throw new Error(`Cannot resolve directory for type: ${item.type}`);

  const prefix = item.type === 'character' ? 'char_' : '';
  return `${dir}/${prefix}${item.slug}.yaml`;
}
