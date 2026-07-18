import type { ContentPlan } from '@las-flores/shared';
import { createItem } from './createPlanItem.js';

/* eslint-disable max-lines -- plan template builders are cohesively grouped in one module */

export function buildMysteryPlan(userDescription: string): ContentPlan {
  const missionId = crypto.randomUUID();
  const dialogueId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Mystery: ${userDescription}`,
    items: [
      createItem({
        id: missionId,
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
        id: dialogueId,
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
}

export function buildShopkeeperPlan(userDescription: string): ContentPlan {
  const characterId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Shopkeeper: ${userDescription}`,
    items: [
      createItem({
        id: characterId,
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
}

export function buildLocationPlan(userDescription: string): ContentPlan {
  const locationId = crypto.randomUUID();
  const sceneId = crypto.randomUUID();
  const dialogueId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Location: ${userDescription}`,
    items: [
      createItem({
        id: locationId,
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
        id: sceneId,
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
        id: dialogueId,
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
      { fromItem: sceneId, toItem: dialogueId, field: 'available_dialogues', action: 'add' },
    ],
    status: 'draft',
  };
}

export function buildGigPlan(userDescription: string): ContentPlan {
  const sceneId = crypto.randomUUID();
  const dialogueId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Gig: ${userDescription}`,
    items: [
      createItem({
        type: 'gig',
        name: 'New Gig',
        slug: 'new_gig',
        fields: {
          name: 'TODO: Gig name',
          description: userDescription,
          reward: 'TODO: Add reward',
        },
      }),
      createItem({
        id: sceneId,
        type: 'scene',
        name: 'Gig Location',
        slug: 'gig_scene',
        fields: {
          name: 'TODO: Scene name',
          description: 'Scene where the gig takes place',
          district: 'TODO: Add district',
          mood: 'TODO: Add mood',
          available_dialogues: [],
        },
        dependsOn: [],
      }),
      createItem({
        id: dialogueId,
        type: 'dialogue',
        name: 'Gig Briefing',
        slug: 'gig_briefing',
        fields: {
          name: 'Gig Briefing',
          description: 'Briefing dialogue for the gig',
          start_node_id: 'start',
          nodes: {
            start: {
              id: 'start',
              type: 'narrator',
              text: 'TODO: Add gig briefing text',
              choices: [{ id: 'continue', text: 'Continue', next_node_id: 'end' }],
            },
            end: { id: 'end', type: 'narrator', text: 'TODO: Add ending', is_end: true },
          },
        },
        dependsOn: [sceneId],
      }),
    ],
    links: [
      { fromItem: sceneId, toItem: dialogueId, field: 'available_dialogues', action: 'add' },
    ],
    status: 'draft',
  };
}

export function buildDialogueScenePlan(userDescription: string): ContentPlan {
  const dialogueId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Dialogue Scene: ${userDescription}`,
    items: [
      createItem({
        id: dialogueId,
        type: 'dialogue',
        name: 'New Dialogue',
        slug: 'new_dialogue',
        fields: {
          name: 'TODO: Dialogue name',
          description: userDescription,
          start_node_id: 'start',
          nodes: {
            start: {
              id: 'start',
              type: 'narrator',
              text: 'TODO: Add dialogue text',
              choices: [{ id: 'continue', text: 'Continue', next_node_id: 'end' }],
            },
            end: { id: 'end', type: 'narrator', text: 'TODO: Add ending', is_end: true },
          },
        },
      }),
      createItem({
        type: 'overlay',
        name: 'Dialogue Overlay',
        slug: 'dialogue_overlay',
        fields: {
          name: 'TODO: Overlay name',
          description: 'Overlay for the dialogue',
          target_tree_id: dialogueId,
          modifications: [],
        },
        dependsOn: [dialogueId],
      }),
    ],
    links: [],
    status: 'draft',
  };
}

export function buildVaultCollectionPlan(userDescription: string): ContentPlan {
  const missionId = crypto.randomUUID();
  // vault items use missionId as dependency

  return {
    id: crypto.randomUUID(),
    description: `Vault Collection: ${userDescription}`,
    items: [
      createItem({
        id: missionId,
        type: 'mission',
        name: 'Collection Mission',
        slug: 'collection_mission',
        fields: {
          title: 'TODO: Mission title',
          description: userDescription,
          status: 'ACTIVE',
        },
      }),
      createItem({
        type: 'vault',
        name: 'Vault Item 1',
        slug: 'vault_item_1',
        fields: {
          name: 'TODO: Item name',
          description: 'A vault item for the collection',
          item_type: 'clue',
          mission_id: missionId,
        },
        dependsOn: [missionId],
      }),
      createItem({
        type: 'vault',
        name: 'Vault Item 2',
        slug: 'vault_item_2',
        fields: {
          name: 'TODO: Item name',
          description: 'Another vault item for the collection',
          item_type: 'memento',
          mission_id: missionId,
        },
        dependsOn: [missionId],
      }),
    ],
    links: [],
    status: 'draft',
  };
}
export function buildMissionFromScenePlan(userDescription: string): ContentPlan { // eslint-disable-line max-lines-per-function -- single cohesive plan builder
  const missionId = crypto.randomUUID();
  const characterId = crypto.randomUUID();
  const sceneId = crypto.randomUUID();
  const dialogueId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    description: `Mission from Scene: ${userDescription}`,
    items: [
      createItem({
        id: missionId,
        type: 'mission',
        name: 'New Mission',
        slug: 'new_mission',
        fields: {
          title: 'TODO: Mission title',
          description: userDescription,
          status: 'ACTIVE',
        },
      }),
      createItem({
        id: characterId,
        type: 'character',
        name: 'Mission Giver',
        slug: 'mission_giver',
        fields: {
          name: 'TODO: Character name',
          description: 'A mission giver who provides quests to the player',
          title: 'TODO: Title',
          metadata: {
            type: 'human',
            role: 'npc',
            faction: 'TODO: Add faction',
            personality: 'TODO: Add personality',
          },
        },
      }),
      createItem({
        id: sceneId,
        type: 'scene',
        name: 'Mission Scene',
        slug: 'mission_scene',
        fields: {
          name: 'TODO: Scene name',
          description: 'Scene where the mission takes place',
          district: 'TODO: Add district',
          mood: 'TODO: Add mood',
          available_dialogues: [],
        },
        dependsOn: [characterId],
      }),
      createItem({
        id: dialogueId,
        type: 'dialogue',
        name: 'Mission Dialogue',
        slug: 'mission_dialogue',
        fields: {
          name: 'Mission Intro',
          description: 'Introduction dialogue for the mission with reward choice',
          start_node_id: 'start',
          nodes: {
            start: {
              id: 'start',
              type: 'character',
              speaker_id: characterId,
              text: 'TODO: Mission giver dialogue text',
              choices: [
                {
                  id: 'accept',
                  text: 'Accept the mission',
                  next_node_id: 'reward',
                },
                {
                  id: 'decline',
                  text: 'Decline',
                  next_node_id: 'decline_end',
                },
              ],
            },
            reward: {
              id: 'reward',
              type: 'narrator',
              text: 'TODO: Mission accepted, here is your reward',
              is_end: true,
              effects: {
                grant_credits: {
                  amount: 100,
                  currency: 'credits',
                },
              },
            },
            decline_end: {
              id: 'decline_end',
              type: 'narrator',
              text: 'TODO: Mission declined',
              is_end: true,
            },
          },
        },
        dependsOn: [sceneId],
      }),
    ],
    links: [
      {
        fromItem: sceneId,
        toItem: dialogueId,
        field: 'available_dialogues',
        action: 'add',
      },
      {
        fromItem: dialogueId,
        toItem: missionId,
        field: 'mission_id',
        action: 'set',
      },
    ],
    status: 'draft',
  };
}
