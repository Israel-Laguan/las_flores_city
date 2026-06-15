import { describe, test, expect } from '@jest/globals';

function detectCycles(nodes: Record<string, any>): { hasCycle: boolean; path?: string } {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = nodes[nodeId];
    if (!node) {
      path.pop();
      recursionStack.delete(nodeId);
      return false;
    }

    if (node.choices) {
      for (const choice of node.choices) {
        if (!visited.has(choice.next_node_id)) {
          if (dfs(choice.next_node_id)) {
            return true;
          }
        } else if (recursionStack.has(choice.next_node_id)) {
          path.push(choice.next_node_id);
          return true;
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      path.length = 0;
      if (dfs(nodeId)) {
        return { hasCycle: true, path: path.join(' -> ') };
      }
    }
  }

  return { hasCycle: false };
}

describe('Dialogue Cycle Detection', () => {
  test('Detects simple 2-node cycle', () => {
    const nodes = {
      node_a: {
        id: 'node_a',
        type: 'narrator',
        text: 'Node A',
        choices: [{ id: 'c1', text: 'Go to B', next_node_id: 'node_b' }],
      },
      node_b: {
        id: 'node_b',
        type: 'narrator',
        text: 'Node B',
        choices: [{ id: 'c2', text: 'Go to A', next_node_id: 'node_a' }],
      },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(true);
    expect(result.path).toContain('node_a');
    expect(result.path).toContain('node_b');
  });

  test('Detects 3-node cycle', () => {
    const nodes = {
      a: { id: 'a', type: 'narrator', text: 'A', choices: [{ id: 'c1', text: 'to B', next_node_id: 'b' }] },
      b: { id: 'b', type: 'narrator', text: 'B', choices: [{ id: 'c2', text: 'to C', next_node_id: 'c' }] },
      c: { id: 'c', type: 'narrator', text: 'C', choices: [{ id: 'c3', text: 'to A', next_node_id: 'a' }] },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(true);
  });

  test('No cycle in linear dialogue', () => {
    const nodes = {
      start: {
        id: 'start',
        type: 'narrator',
        text: 'Start',
        choices: [{ id: 'c1', text: 'Next', next_node_id: 'middle' }],
      },
      middle: {
        id: 'middle',
        type: 'narrator',
        text: 'Middle',
        choices: [{ id: 'c2', text: 'End', next_node_id: 'end' }],
      },
      end: {
        id: 'end',
        type: 'narrator',
        text: 'End',
      },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(false);
  });

  test('No cycle in branching dialogue', () => {
    const nodes = {
      start: {
        id: 'start',
        type: 'narrator',
        text: 'Start',
        choices: [
          { id: 'c1', text: 'Path A', next_node_id: 'path_a' },
          { id: 'c2', text: 'Path B', next_node_id: 'path_b' },
        ],
      },
      path_a: {
        id: 'path_a',
        type: 'narrator',
        text: 'Path A',
        choices: [{ id: 'c3', text: 'End', next_node_id: 'end' }],
      },
      path_b: {
        id: 'path_b',
        type: 'narrator',
        text: 'Path B',
        choices: [{ id: 'c4', text: 'End', next_node_id: 'end' }],
      },
      end: { id: 'end', type: 'narrator', text: 'End' },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(false);
  });

  test('Self-referencing node is a cycle', () => {
    const nodes = {
      self: {
        id: 'self',
        type: 'narrator',
        text: 'Self',
        choices: [{ id: 'c1', text: 'Loop', next_node_id: 'self' }],
      },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(true);
  });

  test('Empty nodes has no cycle', () => {
    const result = detectCycles({});
    expect(result.hasCycle).toBe(false);
  });

  test('Single node with no choices has no cycle', () => {
    const nodes = {
      solo: { id: 'solo', type: 'narrator', text: 'Solo' },
    };

    const result = detectCycles(nodes);
    expect(result.hasCycle).toBe(false);
  });
});
