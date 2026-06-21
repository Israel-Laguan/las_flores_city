import { compileTree } from '../../src/content/compiler.js';
import type { DialogueNode } from '@las-flores/shared';

// ============================================================
// Compiler Unit Tests
//
// Pure-algorithm tests for the AOT dialogue chunk compiler.
// No database, no Redis. Tests the BFS chunking logic against
// hand-crafted fixture trees.
// ============================================================

// ChunkSchema requires a real UUID for tree_id — fixtures share this.
const TREE_ID = '11111111-1111-4111-8111-111111111111';

describe('Compiler Unit Tests', () => {
  describe('compileTree — basic scenarios', () => {
    it('linear tree ≤15 nodes, no boundaries → one chunk, zero leaves', () => {
      // 3-node chain: n1 -> n2 -> n3 (end)
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [{ id: 'c1', text: 'Next', next_node_id: 'n2' }] },
        n2: { id: 'n2', type: 'narrator', text: 'Mid', choices: [{ id: 'c2', text: 'Next', next_node_id: 'n3' }] },
        n3: { id: 'n3', type: 'narrator', text: 'End', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunk_key).toBe('n1');
      expect(Object.keys(chunks[0].nodes)).toEqual(['n1', 'n2', 'n3']);
      expect(Object.keys(chunks[0].leaves)).toHaveLength(0);
    });

    it('economy boundary (time_block_cost) → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c_free', text: 'Free', next_node_id: 'n2' },
          { id: 'c_cost', text: '[-1 TB] Buy', next_node_id: 'n3', time_block_cost: { amount: 1, description: 'Buy coffee' } },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Free path', is_end: true },
        n3: { id: 'n3', type: 'narrator', text: 'Paid path', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      // n1's choices lead to two different nodes; n1 chunk has
      // n1 + n2 (free) + n3 (guarded, cut at choice)
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      expect(chunk1).toBeDefined();
      // The costed choice should be rewritten to point at a leaf
      const costedChoice = chunk1.nodes.n1.choices!.find(c => c.id === 'c_cost')!;
      expect(costedChoice.next_node_id).toMatch(/^__leaf__:/);
      // The leaf should be GUARDED with time_block_cost reason
      const leafKey = costedChoice.next_node_id;
      const leaf = chunk1.leaves[leafKey];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('time_block_cost');
      expect(leaf.tb_cost).toBe(1);
    });

    it('effects boundary (target node has effects) → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [{ id: 'c1', text: 'Go', next_node_id: 'n2' }] },
        n2: { id: 'n2', type: 'narrator', text: 'Effect node', effects: { story_beat: 'act1' }, is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const choice = chunk1.nodes.n1.choices!.find(c => c.id === 'c1')!;
      expect(choice.next_node_id).toMatch(/^__leaf__:/);
      const leaf = chunk1.leaves[choice.next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('effects');
    });

    it('conditional boundary (required_flags) → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Go', next_node_id: 'n2', required_flags: { has_key: true } },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'End', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('conditional');
    });

    it('mystery_solve boundary → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Solve', next_node_id: 'n2', mystery_solve: '00000000-0000-0000-0000-000000000001' },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Breakthrough', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('mystery_solve');
    });

    it('vault_unlock boundary → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Unlock', next_node_id: 'n2', vault_unlock: '00000000-0000-0000-0000-000000000002' },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Vault item', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('vault_unlock');
    });

    it('relationship_change boundary → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Befriend', next_node_id: 'n2', relationship_change: { stat: 'friendship', amount: 5 } },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Friend', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('relationship_change');
    });

    it('overlay_gate boundary → GUARDED leaf', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [{ id: 'c1', text: 'Go', next_node_id: 'n2' }] },
        n2: { id: 'n2', type: 'narrator', text: 'Gate node', choices: [{ id: 'c2', text: 'Next', next_node_id: 'n3' }] },
        n3: { id: 'n3', type: 'narrator', text: 'End', is_end: true },
      };

      // n2 is in the gate set (some overlay targets it)
      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set(['n2']));

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toContain('overlay_gate');
      // n2 should start its own chunk
      expect(chunks.find(c => c.chunk_key === 'n2')).toBeDefined();
    });

    it('multi-reason edge (cost + vault) → GUARDED with both reasons', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Buy key', next_node_id: 'n2',
            time_block_cost: { amount: 2, description: 'Buy' },
            vault_unlock: '00000000-0000-0000-0000-000000000003' },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Key item', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      const leaf = chunk1.leaves[chunk1.nodes.n1.choices![0].next_node_id];
      expect(leaf.type).toBe('GUARDED');
      expect(leaf.reasons).toEqual(expect.arrayContaining(['time_block_cost', 'vault_unlock']));
      expect(leaf.tb_cost).toBe(2);
    });
  });

  describe('compileTree — structural scenarios', () => {
    it('size limit (20 linear nodes) → FREE leaf at 15, remainder in chunk 2', () => {
      const nodes: Record<string, DialogueNode> = {};
      for (let i = 1; i <= 20; i++) {
        const id = `n${i}`;
        const isEnd = i === 20;
        const choices = isEnd ? undefined : [{ id: `c${i}`, text: `Go ${i+1}`, next_node_id: `n${i+1}` }];
        nodes[id] = { id, type: 'narrator', text: `Node ${i}`, is_end: isEnd || undefined, choices };
      }

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // First chunk: exactly 15 nodes
      const chunk1 = chunks.find(c => c.chunk_key === 'n1')!;
      expect(Object.keys(chunk1.nodes).length).toBe(15);
      // It should have exactly 1 FREE leaf
      const leafEntries = Object.values(chunk1.leaves);
      expect(leafEntryLength(leafEntries)).toBe(1);
      expect(leafEntryType(leafEntries, 0)).toBe('FREE');

      // Verify total nodes across all chunks = 20
      const totalNodes = chunks.reduce((sum, c) => sum + Object.keys(c.nodes).length, 0);
      expect(totalNodes).toBe(20);
    });

    it('diamond / convergence → shared node compiled once', () => {
      // n1 -> n2 -> n4
      // n1 -> n3 -> n4
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Path A', next_node_id: 'n2' },
          { id: 'c2', text: 'Path B', next_node_id: 'n3' },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Path A', choices: [{ id: 'c3', text: 'Merge', next_node_id: 'n4' }] },
        n3: { id: 'n3', type: 'narrator', text: 'Path B', choices: [{ id: 'c4', text: 'Merge', next_node_id: 'n4' }] },
        n4: { id: 'n4', type: 'narrator', text: 'Merge point', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      // All nodes fit in one chunk (4 < 15)
      expect(chunks).toHaveLength(1);
      expect(Object.keys(chunks[0].nodes)).toEqual(['n1', 'n2', 'n3', 'n4']);
      // n4 should appear only once
      const n4Count = chunks.reduce((sum, c) => sum + (c.nodes.n4 ? 1 : 0), 0);
      expect(n4Count).toBe(1);
    });

    it('cycle (A→B→A) → no infinite loop, one chunk', () => {
      const nodes: Record<string, DialogueNode> = {
        a: { id: 'a', type: 'narrator', text: 'Node A', choices: [{ id: 'c1', text: 'To B', next_node_id: 'b' }] },
        b: { id: 'b', type: 'narrator', text: 'Node B', choices: [{ id: 'c2', text: 'To A', next_node_id: 'a' }] },
      };

      const chunks = compileTree(TREE_ID, 'a', nodes, new Set());

      expect(chunks).toHaveLength(1);
      expect(Object.keys(chunks[0].nodes)).toHaveLength(2);
      // No leaves — both edges are free interior, cycle broken by visited set
      expect(Object.keys(chunks[0].leaves)).toHaveLength(0);
    });

    it('dangling edge → warning logged, no crash, no leaf for that edge', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [
          { id: 'c1', text: 'Good', next_node_id: 'n2' },
          { id: 'c2', text: 'Broken', next_node_id: 'nonexistent' },
        ]},
        n2: { id: 'n2', type: 'narrator', text: 'Real next', is_end: true },
      };

      const chunks = compileTree(TREE_ID, 'n1', nodes, new Set());

      expect(chunks).toHaveLength(1);
      // The dangling choice should still be in the chunk (untouched),
      // but no leaf is created for it and no crash occurs
      expect(chunks[0].nodes.n1.choices!.length).toBe(2);
      // No leaf with 'nonexistent' as target
      const hasNonexistentLeaf = Object.values(chunks[0].leaves).some(
        (l: any) => l.target_chunk === 'nonexistent'
      );
      expect(hasNonexistentLeaf).toBe(false);

      consoleSpy.mockRestore();
    });

    it('idempotency — same input produces identical output', () => {
      const nodes: Record<string, DialogueNode> = {
        n1: { id: 'n1', type: 'narrator', text: 'Start', choices: [{ id: 'c1', text: 'Go', next_node_id: 'n2' }] },
        n2: { id: 'n2', type: 'narrator', text: 'End', is_end: true },
      };

      const result1 = compileTree(TREE_ID, 'n1', nodes, new Set());
      const result2 = compileTree(TREE_ID, 'n1', nodes, new Set());

      expect(result1).toEqual(result2);
    });
  });
});

// Helpers for the size-limit test — Object.values returns Leaf[]
// whose type union doesn't expose .type cleanly, so index in.
function leafEntryLength(entries: any[]): number {
  return entries.length;
}
function leafEntryType(entries: any[], idx: number): string {
  return entries[idx]?.type;
}
