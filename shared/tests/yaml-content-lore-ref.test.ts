/**
 * Property 1: lore_ref optional field acceptance across all schemas
 * Validates: Requirements 1.1–1.8
 *
 * For any valid YAML object for any of the six schemas, both the variant with
 * lore_ref omitted and the variant with lore_ref set to any string of 0–255
 * characters should parse successfully; the variant with lore_ref set to a
 * string longer than 255 characters should fail to parse.
 */

import * as fc from 'fast-check';
import {
  YAMLCharacterSchema,
  YAMLSceneSchema,
  YAMLMysterySchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLLocationSchema,
} from '../src/schemas/yaml-content.js';

// ---------------------------------------------------------------------------
// Arbitraries for required fields of each schema
// ---------------------------------------------------------------------------

/** A valid UUID arbitrary */
const uuid = fc.uuid();

/** A non-empty string up to N chars */
const str = (min: number, max: number) =>
  fc.string({ minLength: min, maxLength: max });

/** A minimal valid DialogueNode record (required by Dialogue and Overlay schemas) */
const minimalNodes = fc.record({
  start: fc.record({
    id: fc.constant('start'),
    type: fc.constant('narrator' as const),
    text: fc.constant('Hello'),
    is_end: fc.constant(true),
  }),
});

// Base valid object arbitraries (no lore_ref)

const baseCharacter = fc.record({
  id: uuid,
  name: str(1, 100),
  description: str(0, 1000),
});

const baseScene = fc.record({
  id: uuid,
  name: str(1, 100),
  description: str(0, 1000),
  district: str(0, 50),
});

const baseMystery = fc.record({
  id: uuid,
  title: str(1, 255),
  description: str(1, 500),
});

const baseDialogue = fc.record({
  id: uuid,
  name: str(1, 100),
  start_node_id: fc.constant('start'),
  nodes: minimalNodes,
});

const baseOverlay = fc.record({
  id: uuid,
  name: str(1, 100),
  target_tree_id: uuid,
});

const baseLocation = fc.record({
  id: uuid,
  type: fc.constant('location' as const),
  name: str(1, 100),
});

// ---------------------------------------------------------------------------
// lore_ref arbitraries
// ---------------------------------------------------------------------------

/** Valid lore_ref: string 0–255 chars */
const validLoreRef = fc.string({ minLength: 0, maxLength: 255 });

/** Invalid lore_ref: string >255 chars */
const tooLongLoreRef = fc.string({ minLength: 256, maxLength: 400 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSucceeds(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): boolean {
  return schema.safeParse(value).success;
}

function parseFails(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown): boolean {
  return !schema.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lore_ref optional field acceptance across all schemas (Property 1)', () => {
  const NUM_RUNS = 100;

  // --- YAMLCharacterSchema ---

  describe('YAMLCharacterSchema', () => {
    it('accepts valid objects without lore_ref (Req 1.1, 1.7)', () => {
      fc.assert(
        fc.property(baseCharacter, (obj) => {
          return parseSucceeds(YAMLCharacterSchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.1)', () => {
      fc.assert(
        fc.property(baseCharacter, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLCharacterSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.8)', () => {
      fc.assert(
        fc.property(baseCharacter, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLCharacterSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // --- YAMLSceneSchema ---

  describe('YAMLSceneSchema', () => {
    it('accepts valid objects without lore_ref (Req 1.2)', () => {
      fc.assert(
        fc.property(baseScene, (obj) => {
          return parseSucceeds(YAMLSceneSchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.2)', () => {
      fc.assert(
        fc.property(baseScene, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLSceneSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.2)', () => {
      fc.assert(
        fc.property(baseScene, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLSceneSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // --- YAMLMysterySchema ---

  describe('YAMLMysterySchema', () => {
    it('accepts valid objects without lore_ref (Req 1.3)', () => {
      fc.assert(
        fc.property(baseMystery, (obj) => {
          return parseSucceeds(YAMLMysterySchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.3)', () => {
      fc.assert(
        fc.property(baseMystery, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLMysterySchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.3)', () => {
      fc.assert(
        fc.property(baseMystery, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLMysterySchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // --- YAMLDialogueSchema ---

  describe('YAMLDialogueSchema', () => {
    it('accepts valid objects without lore_ref (Req 1.4)', () => {
      fc.assert(
        fc.property(baseDialogue, (obj) => {
          return parseSucceeds(YAMLDialogueSchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.4)', () => {
      fc.assert(
        fc.property(baseDialogue, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLDialogueSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.4)', () => {
      fc.assert(
        fc.property(baseDialogue, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLDialogueSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // --- YAMLOverlaySchema ---

  describe('YAMLOverlaySchema', () => {
    it('accepts valid objects without lore_ref (Req 1.5)', () => {
      fc.assert(
        fc.property(baseOverlay, (obj) => {
          return parseSucceeds(YAMLOverlaySchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.5)', () => {
      fc.assert(
        fc.property(baseOverlay, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLOverlaySchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.5)', () => {
      fc.assert(
        fc.property(baseOverlay, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLOverlaySchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // --- YAMLLocationSchema ---

  describe('YAMLLocationSchema', () => {
    it('accepts valid objects without lore_ref (Req 1.6)', () => {
      fc.assert(
        fc.property(baseLocation, (obj) => {
          return parseSucceeds(YAMLLocationSchema, obj);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('accepts valid objects with lore_ref of 0–255 chars (Req 1.6)', () => {
      fc.assert(
        fc.property(baseLocation, validLoreRef, (obj, loreRef) => {
          return parseSucceeds(YAMLLocationSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it('rejects objects with lore_ref longer than 255 chars (Req 1.6)', () => {
      fc.assert(
        fc.property(baseLocation, tooLongLoreRef, (obj, loreRef) => {
          return parseFails(YAMLLocationSchema, { ...obj, lore_ref: loreRef });
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
