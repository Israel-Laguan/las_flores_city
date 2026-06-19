import { describe, test, expect } from '@jest/globals';
import { validateContentString, validateContentByType } from '../../src/content/validate.js';

// ============================================================
// validateContentString Unit Tests
//
// Pure tests for the new string-in validator extracted from
// validateYAMLFile. This is the API the future UGC submit
// endpoint will call with request-body YAML. No file I/O, no
// DB, no Redis.
// ============================================================

const VALID_DIALOGUE_YAML = `
id: 11111111-1111-1111-1111-111111111111
name: Test Dialogue
start_node_id: start
nodes:
  start:
    id: start
    type: narrator
    text: Hello world.
    is_end: true
`;

const VALID_CHARACTER_YAML = `
id: 22222222-2222-2222-2222-222222222222
name: Test Character
description: A test character for unit testing.
`;

const MALFORMED_YAML = `
id: not-a-uuid
name:
  - this is a list where a string was expected
`;

const YAML_WITH_XSS = `
id: 33333333-3333-3333-3333-333333333333
name: Evil Character
description: <script>alert('xss')</script> hello
`;

const YAML_WITH_WRITTEN_BY = `
id: 44444444-4444-4444-4444-444444444444
name: UGC Character
description: Authored by a player.
written_by: "@architect_kai"
`;

describe('validateContentString', () => {
  test('accepts valid dialogue YAML', async () => {
    const result = await validateContentString(VALID_DIALOGUE_YAML, 'dialogue');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts valid character YAML', async () => {
    const result = await validateContentString(VALID_CHARACTER_YAML, 'character');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts YAML with written_by field (Slice 1 integration)', async () => {
    const result = await validateContentString(YAML_WITH_WRITTEN_BY, 'character');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects malformed YAML with a parse error', async () => {
    const result = await validateContentString(MALFORMED_YAML, 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('Schema validation failed') || e.message.includes('YAML parse error'))).toBe(true);
  });

  test('rejects YAML containing a script tag (XSS)', async () => {
    const result = await validateContentString(YAML_WITH_XSS, 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('XSS') || e.message.includes('script'))).toBe(true);
  });

  test('rejects YAML that is not valid YAML syntax at all', async () => {
    const result = await validateContentString('foo: [unclosed', 'character');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('YAML parse error'))).toBe(true);
  });
});

describe('validateContentByType (now exported)', () => {
  test('validates a parsed character object directly', () => {
    const result = validateContentByType('character', {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Direct Character',
      description: 'Called without file I/O.',
    });
    expect(result.valid).toBe(true);
  });

  test('flags an invalid character object', () => {
    const result = validateContentByType('character', {
      id: 'not-a-uuid',
      // missing name and description
    });
    expect(result.valid).toBe(false);
  });
});
