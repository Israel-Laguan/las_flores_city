export interface FieldDefinition {
  label: string;
  key: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}

export const FIELD_DEFINITIONS: Record<string, FieldDefinition[]> = {
  character: [
    { label: 'Name', key: 'name', placeholder: 'Character name' },
    { label: 'Title', key: 'title', placeholder: 'e.g. Bartender at The Neon Flask' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
    { label: 'Personality', key: 'metadata.personality', placeholder: 'e.g. reluctant_hero' },
    { label: 'Faction', key: 'metadata.faction', placeholder: 'e.g. independent' },
    { label: 'Role', key: 'metadata.role', placeholder: 'e.g. npc' },
  ],
  scene: [
    { label: 'Name', key: 'name', placeholder: 'Scene name' },
    { label: 'District', key: 'district', placeholder: 'e.g. downtown' },
    { label: 'Mood', key: 'mood', placeholder: 'e.g. bustling, tense, mysterious' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  dialogue: [
    { label: 'Name', key: 'name', placeholder: 'Dialogue name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  mission: [
    { label: 'Title', key: 'title', placeholder: 'Mission title' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  location: [
    { label: 'Name', key: 'name', placeholder: 'Location name' },
    { label: 'District', key: 'district', placeholder: 'e.g. central' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  story: [
    { label: 'Name', key: 'name', placeholder: 'Story name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
  ],
  shop_item: [
    { label: 'Name', key: 'name', placeholder: 'Item name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
    { label: 'Price', key: 'price', placeholder: 'e.g. 100' },
    { label: 'Currency', key: 'currency', placeholder: 'e.g. credits' },
  ],
  gig: [
    { label: 'Name', key: 'name', placeholder: 'Gig name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 1000 },
    { label: 'Reward', key: 'reward', placeholder: 'e.g. 500 credits' },
  ],
  vault: [
    { label: 'Name', key: 'name', placeholder: 'Vault item name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
    { label: 'Item Type', key: 'item_type', placeholder: 'e.g. clue, memento, premium_cg' },
  ],
  overlay: [
    { label: 'Name', key: 'name', placeholder: 'Overlay name' },
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  story_beat: [
    { label: 'Description', key: 'description', multiline: true, maxLength: 500 },
  ],
  map_tile: [
    { label: 'Terrain Type', key: 'terrain_type', placeholder: 'e.g. street, building, park' },
  ],
};

export function getFieldsForType(type: string): FieldDefinition[] {
  return FIELD_DEFINITIONS[type] || [
    { label: 'Name', key: 'name', placeholder: 'Name' },
    { label: 'Description', key: 'description', multiline: true },
  ];
}
