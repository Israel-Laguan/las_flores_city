/**
 * Unit tests — PlanTemplateBuilders (M43).
 *
 * The scoped mission/location templates must produce ContentPlanSchema-valid
 * plans whose skeleton output validates against the YAML content schemas and
 * migrates into mysteries/scenes rows. Pure unit test: no DB/Redis
 * (@las-flores/infra is not imported by the builders, but keep the module
 * graph DB-free by not pulling pipeline services).
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildMissionTemplatePlan,
  buildLocationTemplatePlan,
  buildPlanFromTemplate,
  listPlanTemplates,
  UnknownTemplateError,
} from '../../src/services/PlanTemplateBuilders.js';
import { ContentPlanSchema } from '@las-flores/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('buildMissionTemplatePlan', () => {
  it('produces a schema-valid plan with a single create mission item', () => {
    const plan = buildMissionTemplatePlan({ name: 'Van Der Meer Tapes', slug: 'van_der_meer_tapes' });
    const parsed = ContentPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0];
    expect(item.type).toBe('mission');
    expect(item.action).toBe('create');
    expect(item.slug).toBe('van_der_meer_tapes');
    expect(item.fields.description).toMatch(/^TODO: Add description/);
    expect(item.fields.lore_path).toBe('van_der_meer_tapes.md');
  });

  it('carries an explicit description through to fields', () => {
    const plan = buildMissionTemplatePlan({
      name: 'Tapes', slug: 'tapes', description: 'Recover the tapes before the syndicate.',
    });
    expect(plan.items[0].fields.description).toBe('Recover the tapes before the syndicate.');
  });

  it('generates unique UUID ids across calls (no fixture reuse)', () => {
    const a = buildMissionTemplatePlan({ name: 'A', slug: 'a' });
    const b = buildMissionTemplatePlan({ name: 'B', slug: 'b' });
    expect(a.items[0].id).not.toBe(b.items[0].id);
    a.items.forEach((i) => expect(i.id).toMatch(UUID_RE));
  });

  it('rejects invalid slugs (rejected path)', () => {
    expect(() => buildMissionTemplatePlan({ name: 'X', slug: 'Bad Slug!' })).toThrow(/Invalid slug/);
  });
});

describe('buildLocationTemplatePlan', () => {
  it('produces a schema-valid plan with district carried through', () => {
    const plan = buildLocationTemplatePlan({
      name: 'Acuario Annex', slug: 'acuario_annex', district: 'San Felipe',
      description: 'A flooded archive annex.', tags: ['archive', 'waterfront'],
    });
    expect(ContentPlanSchema.safeParse(plan).success).toBe(true);
    const item = plan.items[0];
    expect(item.type).toBe('location');
    expect(item.fields.district).toBe('San Felipe');
    expect(item.fields.tags).toEqual(['archive', 'waterfront']);
    expect(item.fields.lore_path).toBe('acuario_annex.md');
  });

  it('rejects invalid slugs (rejected path)', () => {
    expect(() => buildLocationTemplatePlan({ name: 'X', slug: 'NOPE', district: 'D' })).toThrow(/Invalid slug/);
  });
});

describe('template registry', () => {
  it('lists exactly the scoped templates (mission first per M43)', () => {
    expect(listPlanTemplates().map((t) => t.id)).toEqual(expect.arrayContaining(['mission', 'location']));
  });

  it('routes through buildPlanFromTemplate and rejects unknown ids', () => {
    const plan = buildPlanFromTemplate('location', { name: 'L', slug: 'l_dock', district: 'Harbor' });
    expect(plan.items[0].type).toBe('location');
    expect(() => buildPlanFromTemplate('wizard', {})).toThrow(UnknownTemplateError);
  });
});
