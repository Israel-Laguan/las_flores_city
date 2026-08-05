import { describe, it, expect } from 'vitest';
import { applyNodeVisual, getNodeVisual, EMPTY_VISUAL } from '@/app/(admin)/dialogues/field-definitions';

describe('dialogue node visual helpers', () => {
  const record = {
    id: 'a0000001-0001-4000-8000-000000000010',
    name: 'Test Dialogue',
    nodes: {
      root: { id: 'root', type: 'character', speaker_id: 'char-1', text: 'Hello' },
    },
  };

  it('applyNodeVisual attaches a visual block to a node', () => {
    const next = applyNodeVisual(record, 'root', {
      expression: 'calculating',
      mood: 'tense',
      position: 'right',
    });

    const node = (next.nodes as Record<string, any>).root;
    expect(node.visual).toEqual({
      expression: 'calculating',
      mood: 'tense',
      position: 'right',
    });
    // Original is not mutated.
    expect((record.nodes as Record<string, any>).root.visual).toBeUndefined();
  });

  it('getNodeVisual reads back the stored visual metadata', () => {
    const next = applyNodeVisual(record, 'root', { cinematic: true, expression: 'tender' });
    expect(getNodeVisual(next, 'root')).toEqual({ cinematic: true, expression: 'tender' });
    expect(getNodeVisual(record, 'root')).toBeUndefined();
  });

  it('applyNodeVisual with an empty visual removes the visual key', () => {
    const next = applyNodeVisual(record, 'root', { ...EMPTY_VISUAL });
    const node = (next.nodes as Record<string, any>).root;
    expect(node.visual).toBeUndefined();
    expect('visual' in node).toBe(false);
  });

  it('applyNodeVisual is immutable (does not share node references)', () => {
    const next = applyNodeVisual(record, 'root', { expression: 'shocked' });
    expect(next.nodes).not.toBe(record.nodes);
    expect((next.nodes as Record<string, any>).root).not.toBe((record.nodes as Record<string, any>).root);
  });
});
