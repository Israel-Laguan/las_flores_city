import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

export interface PlanTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  buildPlan: (userDescription: string) => ContentPlan;
}

function createItem(partial: Partial<ContentPlanItem> & { type: string; name: string; slug: string }): ContentPlanItem {
  return {
    id: crypto.randomUUID(),
    type: partial.type as ContentPlanItem['type'],
    action: partial.action || 'create',
    name: partial.name,
    slug: partial.slug,
    fields: partial.fields || {},
    assetNeeds: partial.assetNeeds || [],
    dependsOn: partial.dependsOn || [],
  };
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'add-mystery',
    label: 'Add a Mystery',
    description: 'Creates a mission + dialogue + overlay + vault item',
    icon: '\u{1F50D}',
    buildPlan: (userDescription: string) => {
      const missionId = crypto.randomUUID();
      const dialogueId = crypto.randomUUID();

      return {
        id: crypto.randomUUID(),
        description: `Mystery: ${userDescription}`,
        items: [
          createItem({
            type: 'mission',
            name: 'New Mystery',
            slug: 'new_mystery',
            fields: {
              title: 'TODO: Mystery title',
              description: userDescription,
              status: 'ACTIVE',
            },
          }),
          createItem({
            type: 'dialogue',
            name: 'Mystery Intro Dialogue',
            slug: 'mystery_intro',
            fields: {
              name: 'Mystery Intro',
              description: 'Introduction dialogue for the mystery',
              start_node_id: 'start',
              nodes: {
                start: {
                  id: 'start',
                  type: 'narrator',
                  text: 'TODO: Add mystery intro text',
                  choices: [{ id: 'continue', text: 'Continue', next_node_id: 'end' }],
                },
                end: { id: 'end', type: 'narrator', text: 'TODO: Add ending', is_end: true },
              },
            },
            dependsOn: [missionId],
          }),
          createItem({
            type: 'overlay',
            name: 'Mystery Overlay',
            slug: 'mystery_overlay',
            fields: {
              name: 'Mystery Overlay',
              description: 'Overlay for mystery dialogue',
              target_tree_id: dialogueId,
              modifications: [],
            },
            dependsOn: [dialogueId],
          }),
          createItem({
            type: 'vault',
            name: 'Mystery Vault Item',
            slug: 'mystery_vault_item',
            fields: {
              name: 'Mystery Clue',
              description: 'A clue for the mystery',
              item_type: 'clue',
              mission_id: missionId,
            },
            dependsOn: [missionId],
          }),
        ],
        links: [
          { fromItem: dialogueId, toItem: missionId, field: 'mission_id', action: 'set' },
        ],
        status: 'draft',
      };
    },
  },
  {
    id: 'add-shopkeeper',
    label: 'Add a Shopkeeper',
    description: 'Creates a character + dialogue + shop items',
    icon: '\u{1F6D2}',
    buildPlan: (userDescription: string) => {
      const characterId = crypto.randomUUID();

      return {
        id: crypto.randomUUID(),
        description: `Shopkeeper: ${userDescription}`,
        items: [
          createItem({
            type: 'character',
            name: 'New Shopkeeper',
            slug: 'new_shopkeeper',
            fields: {
              name: 'TODO: Shopkeeper name',
              description: userDescription,
              title: 'Shopkeeper',
              metadata: { type: 'human', role: 'npc', faction: 'independent', personality: 'merchant' },
            },
          }),
          createItem({
            type: 'dialogue',
            name: 'Shopkeeper Dialogue',
            slug: 'shopkeeper_dialogue',
            fields: {
              name: 'Shopkeeper Intro',
              description: 'Greeting dialogue for the shopkeeper',
              start_node_id: 'start',
              nodes: {
                start: {
                  id: 'start',
                  type: 'narrator',
                  text: 'TODO: Add shopkeeper greeting',
                  choices: [{ id: 'continue', text: 'Continue', next_node_id: 'end' }],
                },
                end: { id: 'end', type: 'narrator', text: 'TODO: Add ending', is_end: true },
              },
            },
            dependsOn: [characterId],
          }),
          createItem({
            type: 'shop_item',
            name: 'Sample Shop Item',
            slug: 'sample_shop_item',
            fields: {
              name: 'TODO: Item name',
              description: 'A sample shop item',
              price: 100,
              currency: 'credits',
            },
          }),
        ],
        links: [],
        status: 'draft',
      };
    },
  },
  {
    id: 'add-location',
    label: 'Add a Location',
    description: 'Creates a location + scene + dialogue',
    icon: '\u{1F4CD}',
    buildPlan: (userDescription: string) => {
      const locationId = crypto.randomUUID();
      const sceneId = crypto.randomUUID();

      return {
        id: crypto.randomUUID(),
        description: `Location: ${userDescription}`,
        items: [
          createItem({
            type: 'location',
            name: 'New Location',
            slug: 'new_location',
            fields: {
              name: 'TODO: Location name',
              description: userDescription,
              district: 'TODO: Add district',
              tags: [],
              history: 'TODO: Add history',
              daytime: 'TODO: Add daytime description',
              nightlife: 'TODO: Add nightlife description',
              important_places: [],
            },
          }),
          createItem({
            type: 'scene',
            name: 'Location Scene',
            slug: 'location_scene',
            fields: {
              name: 'TODO: Scene name',
              description: 'Scene at the new location',
              district: 'TODO: Add district',
              mood: 'TODO: Add mood',
              available_dialogues: [],
            },
            dependsOn: [locationId],
          }),
          createItem({
            type: 'dialogue',
            name: 'Location Dialogue',
            slug: 'location_dialogue',
            fields: {
              name: 'Location Intro',
              description: 'Introduction dialogue at the location',
              start_node_id: 'start',
              nodes: {
                start: {
                  id: 'start',
                  type: 'narrator',
                  text: 'TODO: Add location intro text',
                  choices: [{ id: 'continue', text: 'Continue', next_node_id: 'end' }],
                },
                end: { id: 'end', type: 'narrator', text: 'TODO: Add ending', is_end: true },
              },
            },
            dependsOn: [sceneId],
          }),
        ],
        links: [
          { fromItem: sceneId, toItem: locationId, field: 'available_dialogues', action: 'add' },
        ],
        status: 'draft',
      };
    },
  },
];

export function getTemplateById(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find(t => t.id === id);
}
