/**
 * GAP 3 (M34) — Plan template / builder coverage (refactored equivalent).
 *
 * The pre-graph-db `add-mission-from-scene` template + `buildMissionFromScenePlan`
 * (server/src/services/PlanTemplates.ts, PlanTemplateBuilders.ts) were removed
 * during the graph-db integration (PR #109). The surviving plan-builder primitive
 * is `generateFallbackPlanImpl` (deterministic outline → items+links) wired through
 * `ContentPlanService.validateAndRepairOutline`.
 *
 * This suite asserts the current equivalent of "a registered template builder that
 * yields structured items + a links array":
 *   - generateFallbackPlanImpl is the exported, deterministic builder
 *   - its output is ContentPlanSchema-valid (the template contract)
 *   - it yields typed items (character + scene) with unique ids and a links array
 *   - ContentPlanService.validateAndRepairOutline routes an empty outline to it
 *
 * Per AGENTS.md rule 7, infra is mocked (ContentPlanService pulls it in).
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  generateFallbackPlanImpl,
  validateAndRepairOutlineImpl,
  contentPlanService,
} from '../../src/services/ContentPlanService.js';
import { ContentPlanSchema, type ContentPlan } from '@las-flores/shared';

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

describe('plan template builder (GAP 3 — graph-db equivalent)', () => {
  it('generateFallbackPlanImpl is the registered deterministic builder', () => {
    expect(typeof generateFallbackPlanImpl).toBe('function');
  });

  it('yields a schema-valid plan (template contract) with items + links array', () => {
    const plan = generateFallbackPlanImpl('a detective hunts the syndicate across neon districts');
    const parsed = ContentPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(plan.links)).toBe(true);
    expect(plan.items.length).toBeGreaterThanOrEqual(2);
  });

  it('yields typed items (character + scene) with unique ids', () => {
    const plan = generateFallbackPlanImpl('a detective hunts the syndicate across neon districts');
    const types = plan.items.map((i) => i.type);
    expect(types).toContain('character');
    expect(types).toContain('scene');
    const ids = plan.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(UUID_RE));
  });

  it('the service routes an empty outline through the fallback builder', () => {
    const empty: ContentPlan = {
      id: '11111111-1111-4111-8111-111111111111',
      description: 'a detective hunts the syndicate',
      items: [],
      links: [],
      status: 'draft',
    };
    const repaired = contentPlanService.validateAndRepairOutline(empty, empty.description);
    expect(repaired._meta?.outline_source).toBe('fallback');
    expect(repaired.items.length).toBeGreaterThan(0);
  });

  it('validateAndRepairOutlineImpl is idempotent on an already-valid plan', () => {
    const built = generateFallbackPlanImpl('a detective hunts the syndicate');
    const once = validateAndRepairOutlineImpl(built, 'desc');
    const twice = validateAndRepairOutlineImpl(once, 'desc');
    expect(twice.items.length).toBe(once.items.length);
    expect(twice._meta?.outline_repaired).toBe(false);
  });
});
