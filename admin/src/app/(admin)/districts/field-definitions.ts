import type { FieldDef } from '@/components/entity/FieldDef';

// Keep in sync with WEATHER_TAGS (api/contracts/src/weather). Free text on
// purpose: admin does not depend on api-contracts, and the server validates
// the tag on save/migrate with a path-qualified error.
const WEATHER_HELP = 'One of: clear, overcast, rain, storm, fog, smog, dust. Blank keeps the current value.';

export const DISTRICT_VIEW_FIELDS: FieldDef[] = [
  { key: 'slug', label: 'Slug', type: 'text', readOnly: true, section: 'Identity' },
  { key: 'name', label: 'Name', type: 'text', section: 'Identity' },
  { key: 'weather', label: 'Weather', type: 'text', helpText: WEATHER_HELP, section: 'Environment' },
];

export const DISTRICT_EDIT_FIELDS: FieldDef[] = [
  { key: 'slug', label: 'Slug', type: 'text', readOnly: true, section: 'Identity' },
  { key: 'name', label: 'Name', type: 'text', section: 'Identity' },
  { key: 'weather', label: 'Weather', type: 'text', helpText: WEATHER_HELP, placeholder: 'clear', section: 'Environment' },
];
