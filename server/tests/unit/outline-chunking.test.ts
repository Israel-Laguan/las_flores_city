/**
 * GAP 4 (M34) — OutlineChunking coverage (refactored equivalent).
 *
 * `server/src/services/OutlineChunking.ts` was removed during the graph-db
 * integration (PR #109). Its core normalization helper `normalizeName` was
 * extracted into `server/src/services/types/LLMTypes.ts`, and the
 * outline/plan merge-by-name + slug-dedup behavior now lives in
 * `validateAndRepairOutlineImpl` (server/src/services/ContentPlanService.ts).
 *
 * This suite covers the surviving pieces:
 *   - normalizeName: lowercase + strip unicode-safe non-alphanumerics
 *   - validateAndRepairOutlineImpl: type/action repair, id dedup,
 *     collision-safe slug suffixing (the modern "merge-by-name"),
 *     and fallback-plan generation when items are empty.
 *
 * Per AGENTS.md rule 7, the infra (redis/DB) module is mocked because
 * ContentPlanService pulls it in at import time.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { normalizeName } from '../../src/services/types/LLMTypes.js';
import {
  validateAndRepairOutlineImpl,
  generateFallbackPlanImpl,
} from '../../src/services/ContentPlanService.js';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
  queryContent: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  deleteCache: jest.fn(async () => true),
  setCache: jest.fn(async () => true),
  getCache: jest.fn(async () => null),
  closeConnections: jest.fn(),
  closeRedis: jest.fn(),
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function baseItem(over: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'character',
    action: 'create',
    name: 'Bob',
    slug: 'bob',
    description: '',
    fields: {},
    assetNeeds: [],
    dependsOn: [],
    ...over,
  };
}

function basePlan(over: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    description: 'a description',
    items: [],
    links: [],
    status: 'draft',
    ...over,
  };
}

describe('normalizeName (extracted from OutlineChunking)', () => {
  it('lowercases and strips separators (unicode-safe)', () => {
    expect(normalizeName('Hello_World')).toBe('helloworld');
    expect(normalizeName('José 2!')).toBe('josé2');
  });

  it('strips surrounding whitespace', () => {
    expect(normalizeName('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty/blank input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('guards against null/undefined without throwing', () => {
    expect(normalizeName(null as unknown as string)).toBe('');
    expect(normalizeName(undefined as unknown as string)).toBe('');
  });
});

describe('validateAndRepairOutlineImpl — merge/repair by name+slug', () => {
  it('repairs an invalid item type to character and flags repair', () => {
    const plan = basePlan({ items: [baseItem({ type: 'weird' as unknown as ContentPlanItem['type'] })] });
    const out = validateAndRepairOutlineImpl(plan, 'desc');
    expect(out.items[0].type).toBe('character');
    expect(out._meta?.outline_repaired).toBe(true);
  });

  it('dedupes colliding slugs with a numeric suffix (merge-by-name)', () => {
    const plan = basePlan({
      items: [
        baseItem({ id: '33333333-3333-4333-8333-333333333333', name: 'Alice', slug: 'alice' }),
        baseItem({ id: '44444444-4444-4444-8444-444444444444', name: 'Alice', slug: 'alice' }),
      ],
    });
    const out = validateAndRepairOutlineImpl(plan, 'desc');
    const slugs = out.items.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).toContain('alice');
    expect(slugs).toContain('alice_1');
  });

  it('regenerates duplicate / invalid ids to unique UUIDs', () => {
    const plan = basePlan({
      items: [
        baseItem({ id: 'bad-id-1', name: 'X', slug: 'x' }),
        baseItem({ id: 'bad-id-1', name: 'Y', slug: 'y' }),
      ],
    });
    const out = validateAndRepairOutlineImpl(plan, 'desc');
    expect(out.items[0].id).toMatch(UUID_RE);
    expect(out.items[1].id).toMatch(UUID_RE);
    expect(out.items[0].id).not.toBe(out.items[1].id);
  });

  it('regenerates the second occurrence of a duplicated VALID uuid (dedup branch)', () => {
    const dupId = '55555555-5555-4555-8555-555555555555';
    const plan = basePlan({
      items: [
        baseItem({ id: dupId, name: 'First', slug: 'first' }),
        baseItem({ id: dupId, name: 'Second', slug: 'second' }),
      ],
      links: [
        { fromItem: dupId, toItem: dupId, type: 'unlocks' } as ContentPlan['links'][number],
      ],
    });
    const out = validateAndRepairOutlineImpl(plan, 'desc');
    // First occurrence keeps the canonical id; the duplicate gets a fresh UUID.
    expect(out.items[0].id).toBe(dupId);
    expect(out.items[1].id).toMatch(UUID_RE);
    expect(out.items[1].id).not.toBe(dupId);
    // The dedup branch must NOT register the duplicate's old id in
    // oldToNewIds, so links referencing the canonical id are untouched.
    expect(out.links[0].fromItem).toBe(dupId);
    expect(out.links[0].toItem).toBe(dupId);
  });

  it('derives a slug from the name when missing/invalid', () => {
    const plan = basePlan({ items: [baseItem({ name: 'New Hero', slug: '' })] });
    const out = validateAndRepairOutlineImpl(plan, 'desc');
    expect(out.items[0].slug).toBe('new_hero');
  });
});

describe('generateFallbackPlanImpl — empty outline falls back to a built plan', () => {
  it('validateAndRepairOutlineImpl swaps in the fallback builder when items are empty', () => {
    const plan = basePlan({ items: [] });
    const out = validateAndRepairOutlineImpl(plan, 'detective investigating the neon syndicate');
    expect(out._meta?.outline_source).toBe('fallback');
    expect(out.items.length).toBeGreaterThan(0);
  });

  it('the fallback builder yields a typed plan with distinct item ids', () => {
    const fallback = generateFallbackPlanImpl('detective investigating the neon syndicate');
    expect(fallback.items.length).toBeGreaterThanOrEqual(2);
    const types = fallback.items.map((i) => i.type);
    expect(types).toContain('character');
    expect(types).toContain('scene');
    const ids = fallback.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(UUID_RE));
    expect(fallback.status).toBe('draft');
    expect(fallback._meta?.outline_source).toBe('fallback');
  });
});
