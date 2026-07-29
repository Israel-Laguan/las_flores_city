import type { YAMLCharacter } from '@las-flores/shared';
import type { FieldDef } from '@/components/entity/FieldDef';

const RELATIONSHIP_TYPES = [
  'friend',
  'rival',
  'romance',
  'professional',
  'family',
  'enemy',
  'mentor',
  'subordinate',
] as const;

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'id', label: 'ID', type: 'text', readOnly: true },
  { key: 'name', label: 'Name', type: 'text', section: 'Identity' },
  { key: 'title', label: 'Title', type: 'text', section: 'Identity' },
  { key: 'description', label: 'Description', type: 'textarea', section: 'Identity' },
  { key: 'written_by', label: 'Written By', type: 'text', section: 'Identity' },
  { key: 'lore_ref', label: 'Lore Reference', type: 'text', section: 'Identity' },
  { key: 'lore_path', label: 'Lore Path', type: 'text', readOnly: true, section: 'Identity' },
  { key: 'narrative_path', label: 'Narrative Path', type: 'text', readOnly: true, section: 'Identity' },
];

const STATIC_ASSET_FIELDS: FieldDef[] = [
  { key: 'avatar_url', label: 'Avatar URL', type: 'text', readOnly: true, section: 'Assets' },
  { key: 'atlas_url', label: 'Atlas URL', type: 'text', section: 'Assets' },
];

const ASSET_ENTRY_FIELDS: FieldDef[] = [
  { key: 'url', label: 'URL', type: 'text' },
  { key: 'label', label: 'Stage', type: 'select', options: ['dev', 'staging', 'production'] },
  { key: 'expression', label: 'Expression', type: 'text' },
];

const BIO_FIELDS: FieldDef[] = [
  {
    key: 'biometric_refs.horizontal_face_sheet',
    label: 'H Face Sheet',
    type: 'text',
    section: 'Biometrics',
  },
  {
    key: 'biometric_refs.vertical_face_sheet',
    label: 'V Face Sheet',
    type: 'text',
    section: 'Biometrics',
  },
  {
    key: 'biometric_refs.body_sheet',
    label: 'Body Sheet',
    type: 'text',
    section: 'Biometrics',
  },
];

const MANIFEST_OUTFIT_FIELDS: FieldDef[] = [
  { key: 'id', label: 'Outfit ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  {
    key: 'pose_urls',
    label: 'Pose URLs',
    type: 'array-of-objects',
    itemFields: [
      { key: 'front', label: 'Front', type: 'text' },
      { key: 'side', label: 'Side', type: 'text' },
    ],
    section: 'Asset Manifest',
  },
];

const ASSET_PATH_FIELDS: FieldDef[] = [
  { key: 'asset_paths.portrait', label: 'Portrait', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.biometric', label: 'Biometric', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.expression_strip', label: 'Expression Strip', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.face_base', label: 'Face Base', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.hair_front', label: 'Hair Front', type: 'text', readOnly: true, section: 'Asset Paths' },
  { key: 'asset_paths.hair_back', label: 'Hair Back', type: 'text', readOnly: true, section: 'Asset Paths' },
];

function make(array: FieldDef[], section: string): FieldDef[] {
  return array.map((f) => ({ ...f, section }));
}

export const CHARACTER_VIEW_FIELDS: FieldDef[] = [
  ...IDENTITY_FIELDS,
  ...make(
    [
      { key: 'relationships', label: 'Relationships', type: 'array-of-objects', itemFields: [
        { key: 'target_id', label: 'Target ID', type: 'text' },
        { key: 'type', label: 'Type', type: 'badge' },
        { key: 'closeness', label: 'Closeness (-100..100)', type: 'number' },
        { key: 'trust', label: 'Trust', type: 'number' },
        { key: 'context', label: 'Context', type: 'text' },
      ]},
      { key: 'available_dialogues', label: 'Dialogues', type: 'array' },
      { key: 'portrait_urls', label: 'Portraits', type: 'array-of-objects', itemFields: ASSET_ENTRY_FIELDS },
      { key: 'biometric_refs', label: 'Biometric Ref', type: 'array-of-objects', itemFields: BIO_FIELDS },
      { key: 'asset_manifest.outfits', label: 'Outfits', type: 'array-of-objects', itemFields: MANIFEST_OUTFIT_FIELDS },
      { key: 'metadata', label: 'Metadata', type: 'kv' },
    ],
    'Relationships & Assets',
  ),
  ...STATIC_ASSET_FIELDS,
  ...ASSET_PATH_FIELDS,
];

export const CHARACTER_EDIT_FIELDS: FieldDef[] = [
  ...make(
    [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'written_by', label: 'Written By', type: 'text' },
      { key: 'lore_ref', label: 'Lore Reference', type: 'text' },
      { key: 'atlas_url', label: 'Atlas URL', type: 'text' },
    ],
    'Identity',
  ),
  ...make(
    [
      { key: 'relationships', label: 'Relationships', type: 'array-of-objects', itemFields: [
        { key: 'target_id', label: 'Target ID', type: 'text' },
        { key: 'type', label: 'Type', type: 'select', options: [...RELATIONSHIP_TYPES] },
        { key: 'closeness', label: 'Closeness', type: 'number' },
        { key: 'trust', label: 'Trust', type: 'number' },
        { key: 'context', label: 'Context', type: 'text' },
      ]},
      { key: 'available_dialogues', label: 'Dialogue IDs', type: 'array', helpText: 'One dialogue UUID per item' },
      { key: 'portrait_urls', label: 'Portrait URLs', type: 'array-of-objects', itemFields: ASSET_ENTRY_FIELDS },
    ],
    'Relationships',
  ),
  {
    key: 'metadata',
    label: 'Metadata',
    type: 'kv',
    section: 'Relationships',
    helpText: 'Arbitrary key/value metadata',
  },
];
