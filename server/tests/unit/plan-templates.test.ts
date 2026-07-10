import { describe, it, expect } from '@jest/globals';
import { PLAN_TEMPLATES, getTemplateById } from '../../src/services/PlanTemplates.js';

describe('PlanTemplates', () => {
  it('has templates available', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('add-mystery template creates 4 items', () => {
    const template = getTemplateById('add-mystery');
    expect(template).toBeDefined();
    const plan = template!.buildPlan('Test mystery');
    expect(plan.items).toHaveLength(4);
    expect(plan.items.map(i => i.type)).toContain('mission');
    expect(plan.items.map(i => i.type)).toContain('dialogue');
    expect(plan.items.map(i => i.type)).toContain('overlay');
    expect(plan.items.map(i => i.type)).toContain('vault');
  });

  it('add-shopkeeper template creates 3 items', () => {
    const template = getTemplateById('add-shopkeeper');
    expect(template).toBeDefined();
    const plan = template!.buildPlan('Test shopkeeper');
    expect(plan.items).toHaveLength(3);
    expect(plan.items.map(i => i.type)).toContain('character');
    expect(plan.items.map(i => i.type)).toContain('dialogue');
    expect(plan.items.map(i => i.type)).toContain('shop_item');
  });

  it('add-location template creates 3 items', () => {
    const template = getTemplateById('add-location');
    expect(template).toBeDefined();
    const plan = template!.buildPlan('Test location');
    expect(plan.items).toHaveLength(3);
    expect(plan.items.map(i => i.type)).toContain('location');
    expect(plan.items.map(i => i.type)).toContain('scene');
    expect(plan.items.map(i => i.type)).toContain('dialogue');
  });

  it('all generated plans have valid UUIDs', () => {
    for (const template of PLAN_TEMPLATES) {
      const plan = template.buildPlan('test');
      expect(plan.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      for (const item of plan.items) {
        expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      }
    }
  });

  it('getTemplateById returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });

  it('templates use the user description', () => {
    const template = getTemplateById('add-mystery');
    const plan = template!.buildPlan('The lithium leak mystery');
    expect(plan.description).toContain('The lithium leak mystery');
  });
});
