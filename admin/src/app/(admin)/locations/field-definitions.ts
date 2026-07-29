import type { YAMLLocation } from '@las-flores/shared';
import type { FieldDef } from '@/components/entity/FieldDef';

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'id', label: 'ID', type: 'text', readOnly: true },
  { key: 'type', label: 'Type', type: 'text', readOnly: true },
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'district', label: 'District', type: 'text' },
];

const DESCRIPTION_FIELDS: FieldDef[] = [
  { key: 'history', label: 'History', type: 'textarea' },
  { key: 'daytime', label: 'Daytime', type: 'textarea' },
  { key: 'nightlife', label: 'Nightlife', type: 'textarea' },
  { key: 'conclusion', label: 'Conclusion', type: 'textarea' },
];

const TAG_FIELDS: FieldDef[] = [
  { key: 'color', label: 'Color', type: 'text' },
  { key: 'aliases', label: 'Aliases', type: 'array' },
  { key: 'tags', label: 'Tags', type: 'array' },
  { key: 'alwaysIncludeInContext', label: 'Always Include In Context', type: 'boolean' },
  { key: 'doNotTrack', label: 'Do Not Track', type: 'boolean' },
  { key: 'noAutoInclude', label: 'No Auto Include', type: 'boolean' },
];

const PLACE_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Place Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
];

const MAP_GRID_FIELDS: FieldDef[] = [
  { key: 'map.grid.cols', label: 'Cols', type: 'number' },
  { key: 'map.grid.rows', label: 'Rows', type: 'number' },
  { key: 'map.base_tile', label: 'Base Tile', type: 'text' },
  { key: 'map.walkable_mask', label: 'Walkable Mask', type: 'text' },
];

const MAP_SPAWN_FIELDS: FieldDef[] = [
  { key: 'map.spawn.x', label: 'Spawn X', type: 'number' },
  { key: 'map.spawn.y', label: 'Spawn Y', type: 'number' },
  { key: 'map.spawn.label', label: 'Spawn Label', type: 'text' },
];

const WAYPOINT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'x', label: 'X', type: 'number' },
  { key: 'y', label: 'Y', type: 'number' },
];

const ASSET_PATH_FIELDS: FieldDef[] = [
  { key: 'asset_paths.image', label: 'Image', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.background', label: 'Background', type: 'text', readOnly: true, section: 'Asset Paths' },
];

const IMG_FIELDS: FieldDef[] = [
  { key: 'url', label: 'URL', type: 'text' },
  { key: 'label', label: 'Stage', type: 'select', options: ['dev', 'staging', 'production'] },
  { key: 'expression', label: 'Expression', type: 'text' },
];

function make(array: FieldDef[], section: string): FieldDef[] {
  return array.map((f) => ({ ...f, section }));
}

export const LOCATION_VIEW_FIELDS: FieldDef[] = [
  ...IDENTITY_FIELDS,
  ...make(TAG_FIELDS, 'Tags & Flags'),
  ...make(
    [
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'important_places', label: 'Important Places', type: 'array-of-objects', itemFields: PLACE_FIELDS },
      { key: 'history', label: 'History', type: 'textarea' },
      { key: 'daytime', label: 'Daytime', type: 'textarea' },
      { key: 'nightlife', label: 'Nightlife', type: 'textarea' },
      { key: 'conclusion', label: 'Conclusion', type: 'textarea' },
    ],
    'Description',
  ),
  ...make(
    [
      { key: 'map.grid.cols', label: 'Cols', type: 'number' },
      { key: 'map.grid.rows', label: 'Rows', type: 'number' },
      { key: 'map.spawn.x', label: 'Spawn X', type: 'number' },
      { key: 'map.spawn.y', label: 'Spawn Y', type: 'number' },
      { key: 'map.waypoints', label: 'Waypoints', type: 'array-of-objects', itemFields: WAYPOINT_FIELDS },
    ],
    'Map',
  ),
  {
    key: 'image_urls',
    label: 'Image URLs',
    type: 'array-of-objects',
    itemFields: IMG_FIELDS,
    section: 'Images',
  },
  {
    key: 'metadata',
    label: 'Metadata',
    type: 'kv',
    section: 'Metadata',
  },
  ...ASSET_PATH_FIELDS,
];

export const LOCATION_EDIT_FIELDS: FieldDef[] = [
  ...make(
    [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'district', label: 'District', type: 'text' },
    ],
    'Identity',
  ),
  ...make(TAG_FIELDS, 'Tags & Flags'),
  ...make(
    [
      { key: 'history', label: 'History', type: 'textarea' },
      { key: 'daytime', label: 'Daytime', type: 'textarea' },
      { key: 'nightlife', label: 'Nightlife', type: 'textarea' },
      { key: 'conclusion', label: 'Conclusion', type: 'textarea' },
    ],
    'Description',
  ),
  ...make(
    [
      { key: 'important_places', label: 'Important Places', type: 'array-of-objects', itemFields: PLACE_FIELDS },
      { key: 'map.grid.cols', label: 'Cols', type: 'number' },
      { key: 'map.grid.rows', label: 'Rows', type: 'number' },
      { key: 'map.base_tile', label: 'Base Tile', type: 'text' },
      { key: 'map.walkable_mask', label: 'Walkable Mask', type: 'text' },
      { key: 'map.spawn.x', label: 'Spawn X', type: 'number' },
      { key: 'map.spawn.y', label: 'Spawn Y', type: 'number' },
      { key: 'map.waypoints', label: 'Waypoints', type: 'array-of-objects', itemFields: WAYPOINT_FIELDS },
    ],
    'Map',
  ),
  {
    key: 'metadata',
    label: 'Metadata',
    type: 'kv',
    section: 'Description',
    helpText: 'Arbitrary key/value metadata',
  },
  {
    key: 'image_urls',
    label: 'Image URLs',
    type: 'array-of-objects',
    itemFields: IMG_FIELDS,
    section: 'Images',
  },
];
