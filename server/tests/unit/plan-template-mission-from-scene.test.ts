import { describe, it, expect } from '@jest/globals';
import { buildMissionFromScenePlan } from '../../src/services/PlanTemplateBuilders.js';

describe('buildMissionFromScenePlan', () => {
  it('creates a plan with mission, character, scene, and dialogue', () => {
    const plan = buildMissionFromScenePlan('Help the villager');
    
    expect(plan.items).toHaveLength(4);
    
    const types = plan.items.map(i => i.type);
    expect(types).toContain('mission');
    expect(types).toContain('character');
    expect(types).toContain('scene');
    expect(types).toContain('dialogue');
  });

  it('links scene to dialogue via available_dialogues', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const dialogueLink = plan.links.find(
      l => l.field === 'available_dialogues' && l.action === 'add'
    );
    expect(dialogueLink).toBeDefined();
  });

  it('links dialogue to mission via mission_id', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const missionLink = plan.links.find(
      l => l.field === 'mission_id' && l.action === 'set'
    );
    expect(missionLink).toBeDefined();
  });

  it('dialogue has grant_credits effect on reward node', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const dialogue = plan.items.find(i => i.type === 'dialogue');
    expect(dialogue).toBeDefined();
    
    const nodes = dialogue!.fields.nodes as Record<string, any>;
    const rewardNode = nodes['reward'];
    expect(rewardNode).toBeDefined();
    expect(rewardNode.effects?.grant_credits).toBeDefined();
    expect(rewardNode.effects.grant_credits.amount).toBe(100);
    expect(rewardNode.effects.grant_credits.currency).toBe('credits');
  });

  it('dialogue has accept and decline choices', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const dialogue = plan.items.find(i => i.type === 'dialogue');
    const nodes = dialogue!.fields.nodes as Record<string, any>;
    const startNode = nodes['start'];
    
    expect(startNode.choices).toHaveLength(2);
    expect(startNode.choices[0].id).toBe('accept');
    expect(startNode.choices[1].id).toBe('decline');
  });

  it('mission has ACTIVE status', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const mission = plan.items.find(i => i.type === 'mission');
    expect(mission!.fields.status).toBe('ACTIVE');
  });

  it('character has npc role', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const character = plan.items.find(i => i.type === 'character');
    expect(character!.fields.metadata.role).toBe('npc');
  });

  it('plan status is draft', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    expect(plan.status).toBe('draft');
  });

  it('sets correct dependencies', () => {
    const plan = buildMissionFromScenePlan('Test mission');
    
    const scene = plan.items.find(i => i.type === 'scene');
    const dialogue = plan.items.find(i => i.type === 'dialogue');
    
    expect(scene!.dependsOn.length).toBeGreaterThan(0);
    expect(dialogue!.dependsOn.length).toBeGreaterThan(0);
  });
});
