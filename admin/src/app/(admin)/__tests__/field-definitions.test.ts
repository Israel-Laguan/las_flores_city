import { describe, it, expect } from 'vitest';
import { CHARACTER_VIEW_FIELDS, CHARACTER_EDIT_FIELDS } from '../characters/field-definitions';
import { LOCATION_VIEW_FIELDS, LOCATION_EDIT_FIELDS } from '../locations/field-definitions';
import type { FieldDef } from '@/components/entity/FieldDef';

function assertValidFields(fields: FieldDef[]) {
  for (const field of fields) {
    expect(field.key, `missing key for ${field.label}`).toBeTruthy();
    expect(field.label, `missing label for ${field.key}`).toBeTruthy();
    expect(field.type, `missing type for ${field.key}`).toBeTruthy();
  }
}

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

describe('Character field definitions', () => {
  it('expose view and edit arrays with valid field defs', () => {
    assertValidFields(CHARACTER_VIEW_FIELDS);
    assertValidFields(CHARACTER_EDIT_FIELDS);
  });

  it('relationship type select uses the schema enum options', () => {
    const rel = CHARACTER_EDIT_FIELDS.find((f) => f.key === 'relationships')!;
    expect(rel.type).toBe('array-of-objects');
    const typeField = rel.itemFields?.find((sf) => sf.key === 'type');
    expect(typeField?.type).toBe('select');
    expect(typeField?.options).toEqual([...RELATIONSHIP_TYPES]);
  });
});

describe('Location field definitions', () => {
  it('expose view and edit arrays with valid field defs', () => {
    assertValidFields(LOCATION_VIEW_FIELDS);
    assertValidFields(LOCATION_EDIT_FIELDS);
  });

  it('always include metadata as a kv type in locations', () => {
    const meta = LOCATION_EDIT_FIELDS.find((f) => f.key === 'metadata')!;
    expect(meta.type).toBe('kv');
    expect(meta.section || '').toBeTruthy();
  });
});
