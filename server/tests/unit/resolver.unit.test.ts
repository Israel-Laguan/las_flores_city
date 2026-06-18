import { deepMergeNodes } from '../../src/services/DialogueResolver.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// DialogueResolver Unit Tests
//
// Pure unit tests for the deepMergeNodes function without
// database dependencies. Tests the core merge logic that
// the DialogueResolver uses to combine base trees with
// mystery overlays.
// ============================================================

describe('DialogueResolver Unit Tests', () => {
  describe('deepMergeNodes', () => {
    it('merges base and overlay nodes correctly', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text',
          choices: [
            { id: 'c1', text: 'Base choice A', next_node_id: 'next_a' },
            { id: 'c2', text: 'Base choice B', next_node_id: 'next_b' },
          ],
        },
        next_a: { id: 'next_a', type: 'npc', text: 'Base A end' },
        next_b: { id: 'next_b', type: 'npc', text: 'Base B end' },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlaid root text',
          choices: [
            { id: 'c1', text: 'Mystery choice', next_node_id: 'mystery_path' },
          ],
        },
        mystery_path: {
          id: 'mystery_path',
          type: 'npc',
          text: 'Hidden in shadow...',
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      // Root text is overlaid
      expect(merged.root.text).toBe('Overlaid root text');
      // The overlay's `choices` array replaces the base's
      expect(merged.root.choices).toHaveLength(1);
      expect(merged.root.choices![0].text).toBe('Mystery choice');
      // Overlay-only node is added
      expect(merged.mystery_path).toBeDefined();
      expect(merged.mystery_path.text).toBe('Hidden in shadow...');
      // Base nodes not in overlay are preserved
      expect(merged.next_a.text).toBe('Base A end');
      expect(merged.next_b.text).toBe('Base B end');
    });

    it('returns base nodes unchanged for empty overlay', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: { id: 'root', type: 'narrator', text: 'Base text' },
      };

      const merged = deepMergeNodes(baseNodes, {});
      expect(merged).toEqual(baseNodes);
    });

    it('returns overlay nodes for empty base', () => {
      const overlayNodes: Record<string, DialogueNode> = {
        root: { id: 'root', type: 'narrator', text: 'Overlay text' },
      };

      const merged = deepMergeNodes({}, overlayNodes);
      expect(merged).toEqual(overlayNodes);
    });

    it('preserves all base node properties not in overlay', () => {
      const baseNodes: Record<string, DialogueNode> = {
        node1: {
          id: 'node1',
          type: 'character',
          speaker_id: 'speaker1',
          text: 'Hello',
          thought: 'Base thought',
          is_end: false,
          metadata: { base: true },
        },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        node1: {
          id: 'node1',
          type: 'character',
          text: 'Hi there',
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      // Overlaid text
      expect(merged.node1.text).toBe('Hi there');
      // Preserved properties
      expect(merged.node1.speaker_id).toBe('speaker1');
      expect(merged.node1.thought).toBe('Base thought');
      expect(merged.node1.is_end).toBe(false);
      expect(merged.node1.metadata).toEqual({ base: true });
    });

    it('preserves <important> tags in text fields', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text with <important>important info</important>',
        },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlaid text with <important>new important</important> data',
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      expect(merged.root.text).toBe('Overlaid text with <important>new important</important> data');
      expect(merged.root.text).toContain('<important>');
      expect(merged.root.text).toContain('</important>');
      // Verify tag structure is intact
      expect(merged.root.text).toMatch(/<important>.*<\/important>/);
    });

    it('preserves <important> tags in choice text', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text',
          choices: [
            { id: 'c1', text: 'Use <important>Protocol 7</important>', next_node_id: 'next' },
          ],
        },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlaid text',
          choices: [
            { id: 'c1', text: 'Use <important>Protocol 7</important>', next_node_id: 'mystery' },
          ],
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      expect(merged.root.choices![0].text).toBe('Use <important>Protocol 7</important>');
      expect(merged.root.choices![0].text).toContain('<important>');
      expect(merged.root.choices![0].text).toContain('</important>');
    });

    it('preserves multiple <important> tags in same text', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'First <important>important</important> and second <important>also important</important>',
        },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Updated <important>new important</important> and <important>another important</important>',
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      const importantCount = (merged.root.text.match(/<\/important>/g) || []).length;
      expect(importantCount).toBe(2);
      expect(merged.root.text).toContain('<important>new important</important>');
      expect(merged.root.text).toContain('<important>another important</important>');
    });

    it('handles deeply nested node structures', () => {
      const baseNodes: Record<string, DialogueNode> = {
        node1: { id: 'node1', type: 'narrator', text: 'Node 1', choices: [{ id: 'c1', text: 'To node2', next_node_id: 'node2' }] },
        node2: { id: 'node2', type: 'narrator', text: 'Node 2', choices: [{ id: 'c1', text: 'To node3', next_node_id: 'node3' }] },
        node3: { id: 'node3', type: 'narrator', text: 'Node 3' },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        node2: { id: 'node2', type: 'narrator', text: 'Overlaid Node 2', choices: [{ id: 'c1', text: 'To mystery', next_node_id: 'mystery' }] },
        mystery: { id: 'mystery', type: 'narrator', text: 'Mystery node' },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      expect(merged.node1.text).toBe('Node 1');
      expect(merged.node2.text).toBe('Overlaid Node 2');
      expect(merged.node2.choices![0].next_node_id).toBe('mystery');
      expect(merged.node3.text).toBe('Node 3');
      expect(merged.mystery.text).toBe('Mystery node');
    });

    it('does not modify original objects', () => {
      const baseNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Base text',
        },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        root: {
          id: 'root',
          type: 'narrator',
          text: 'Overlay text',
        },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      // Original objects should be unchanged
      expect(baseNodes.root.text).toBe('Base text');
      expect(overlayNodes.root.text).toBe('Overlay text');
      // Merged result should have overlay text
      expect(merged.root.text).toBe('Overlay text');
    });

    it('merges nodes with different types', () => {
      const baseNodes: Record<string, DialogueNode> = {
        node1: { id: 'node1', type: 'narrator', text: 'Narrator text' },
        node2: { id: 'node2', type: 'character', speaker_id: 'speaker1', text: 'Character text' },
      };

      const overlayNodes: Record<string, DialogueNode> = {
        node1: { id: 'node1', type: 'character', speaker_id: 'speaker2', text: 'Updated text' },
      };

      const merged = deepMergeNodes(baseNodes, overlayNodes);

      expect(merged.node1.type).toBe('character');
      expect(merged.node1.speaker_id).toBe('speaker2');
      expect(merged.node1.text).toBe('Updated text');
      expect(merged.node2.type).toBe('character');
      expect(merged.node2.speaker_id).toBe('speaker1');
    });
  });
});
