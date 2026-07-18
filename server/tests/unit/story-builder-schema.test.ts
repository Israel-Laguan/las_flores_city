import { describe, it, expect } from '@jest/globals';
import { ContentPlanSchema, type ContentPlanItem } from '@las-flores/shared';

function uuidFromChar(ch: string): string {
  return [
    ch.repeat(8),
    ch.repeat(4),
    ch.repeat(4),
    ch.repeat(4),
    ch.repeat(12),
  ].join('-');
}

function makeItem(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: uuidFromChar('1'),
    type: 'character',
    action: 'create',
    name: 'Diego',
    slug: 'diego',
    fields: { description: 'A bartender' },
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

function makePlan(overrides: any = {}) {
  return ContentPlanSchema.parse({
    id: uuidFromChar('0'),
    description: 'Test plan',
    items: [],
    links: [],
    status: 'draft',
    ...overrides,
  });
}

describe('ContentPlanSchema.superRefine', () => {
  it('accepts a plan with unique (type, slug)', () => {
    const plan = makePlan({
      items: [
        makeItem({ id: uuidFromChar('1'), slug: 'diego' }),
        makeItem({ id: uuidFromChar('2'), type: 'scene', slug: 'diego' }),
      ],
    });
    expect(ContentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects duplicate (type, slug) within the same plan', () => {
    const plan = {
      id: uuidFromChar('0'),
      description: 'Test plan',
      items: [
        makeItem({ id: uuidFromChar('1'), slug: 'diego' }),
        makeItem({ id: uuidFromChar('2'), slug: 'diego' }),
      ],
      links: [],
      status: 'draft',
    };
    const result = ContentPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => /Duplicate \(type, slug\)/.test(i.message))).toBe(true);
    }
  });

  it('rejects links referencing unknown fromItem / toItem', () => {
    const plan = {
      id: uuidFromChar('0'),
      description: 'Test plan',
      items: [makeItem({ id: uuidFromChar('1') })],
      links: [{ fromItem: uuidFromChar('1'), toItem: uuidFromChar('3'), field: 'available_dialogues', action: 'add' }],
      status: 'draft',
    };
    const result = ContentPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => /unknown toItem/.test(i.message))).toBe(true);
    }
  });

  it('accepts plan with valid cross-links', () => {
    const plan = makePlan({
      items: [
        makeItem({ id: uuidFromChar('1') }),
        makeItem({ id: uuidFromChar('3'), type: 'dialogue' }),
      ],
      links: [{ fromItem: uuidFromChar('1'), toItem: uuidFromChar('3'), field: 'available_dialogues', action: 'add' }],
    });
    expect(ContentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('accepts item with optional lore_refs', () => {
    const plan = makePlan({
      items: [
        makeItem({ id: uuidFromChar('1'), lore_refs: ['diego', 'neon_flask'] }),
      ],
    });
    expect(ContentPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('accepts item without lore_refs (optional field)', () => {
    const plan = makePlan({
      items: [
        makeItem({ id: uuidFromChar('1') }),
      ],
    });
    const result = ContentPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].lore_refs).toBeUndefined();
    }
  });
});
