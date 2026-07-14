/**
 * Tests for FieldDefinitions.ts
 * Milestone 4: Story Builder CSS rebuild
 */
import { describe, it, expect } from 'vitest';
import { FIELD_DEFINITIONS, getFieldsForType } from '../components/FieldDefinitions';

describe('FIELD_DEFINITIONS', () => {
  it('should have definitions for all required content types', () => {
    const requiredTypes = ['character', 'scene', 'dialogue', 'mission', 'location', 'story', 'shop_item', 'gig', 'vault', 'overlay'];
    for (const type of requiredTypes) {
      expect(FIELD_DEFINITIONS[type]).toBeDefined();
      expect(Array.isArray(FIELD_DEFINITIONS[type])).toBe(true);
    }
  });

  it('character should have name, title, description, and metadata fields', () => {
    const characterFields = FIELD_DEFINITIONS.character;
    const keys = characterFields.map(f => f.key);
    expect(keys).toContain('name');
    expect(keys).toContain('title');
    expect(keys).toContain('description');
    expect(keys).toContain('metadata.personality');
    expect(keys).toContain('metadata.faction');
    expect(keys).toContain('metadata.role');
  });

  it('character should have lore_path and narrative_path fields', () => {
    const characterFields = FIELD_DEFINITIONS.character;
    const keys = characterFields.map(f => f.key);
    expect(keys).toContain('lore_path');
    expect(keys).toContain('narrative_path');
  });

  it('scene should have name, district, mood, and description fields', () => {
    const sceneFields = FIELD_DEFINITIONS.scene;
    const keys = sceneFields.map(f => f.key);
    expect(keys).toContain('name');
    expect(keys).toContain('district');
    expect(keys).toContain('mood');
    expect(keys).toContain('description');
  });

  it('scene should have lore_path and narrative_path fields', () => {
    const sceneFields = FIELD_DEFINITIONS.scene;
    const keys = sceneFields.map(f => f.key);
    expect(keys).toContain('lore_path');
    expect(keys).toContain('narrative_path');
  });

  it('multiline fields should have maxLength defined', () => {
    for (const [type, fields] of Object.entries(FIELD_DEFINITIONS)) {
      for (const field of fields) {
        if (field.multiline) {
          expect(field.maxLength, `${type}.${field.key} should have maxLength`).toBeDefined();
        }
      }
    }
  });

  it('every field should have label and key', () => {
    for (const [type, fields] of Object.entries(FIELD_DEFINITIONS)) {
      for (const field of fields) {
        expect(field.label, `${type} field missing label`).toBeTruthy();
        expect(field.key, `${type} field missing key`).toBeTruthy();
      }
    }
  });
});

describe('getFieldsForType', () => {
  it('should return fields for known type', () => {
    const fields = getFieldsForType('character');
    expect(fields).toEqual(FIELD_DEFINITIONS.character);
  });

  it('should return default fields for unknown type', () => {
    const fields = getFieldsForType('unknown_type');
    expect(fields).toHaveLength(2);
    expect(fields[0].key).toBe('name');
    expect(fields[1].key).toBe('description');
  });

  it('should return default fields for empty string', () => {
    const fields = getFieldsForType('');
    expect(fields).toHaveLength(2);
  });

  it('should handle all defined types', () => {
    for (const type of Object.keys(FIELD_DEFINITIONS)) {
      const fields = getFieldsForType(type);
      expect(fields.length).toBeGreaterThan(0);
    }
  });
});
