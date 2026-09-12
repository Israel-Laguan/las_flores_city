import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ============================================================
// handleChunkBoundaryChoice — tree-revision resolution
//
// Two cubic-flagged bugs around dialogue-choose.ts:295-260:
//
// 1. `cursor.pinned_tree_revision > 0` couldn't distinguish "never
//    pinned" from "legitimately pinned at revision 0", so a session
//    started on revision 0 lost its pin as soon as the tree
//    recompiled and silently resolved against the NEW revision.
//    Fixed by deriving `treeRevision` from `currentChunk.revision`
//    instead — every `dialogue_chunks` row is permanently scoped to
//    the revision it was compiled at (094), so it's an unambiguous
//    source of truth regardless of whether that revision is 0.
//
// 2. The old fallback branch used `currentChunk.tree_id` to query the
//    *current* tree revision without ever checking it matched the
//    player's actual active dialogue (`cursor.active_dialogue_id`),
//    so a mismatched chunk/tree pair could resolve the wrong chunk
//    against the wrong tree's revision. Fixed by rejecting the
//    request outright when `currentChunk.tree_id` doesn't match the
//    player's recorded active dialogue.
//
// Mocks every DB/Redis-bearing module dialogue-choose transitively
// imports (AGENTS.md rule 7), mirroring dialogueChunkBoundary.unit.test.ts.
// ============================================================

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
  queryOLAP: jest.fn(async () => null),
  queryContent: jest.fn(async () => ({ rows: [] })),
  deleteCache: jest.fn(async () => true),
  withOLTPTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    const fakeClient = { query: jest.fn(async () => ({ rows: [] })) };
    return cb(fakeClient as any);
  }),
}));

const resolveNextChunkMock = jest.fn();
jest.mock('../../src/services/DialogueResolver.js', () => ({
  DialogueResolver: {
    loadChunkNodesAndLeaves: jest.fn(),
    resolveNextChunk: (...args: any[]) => resolveNextChunkMock(...args),
  },
}));

const validateChoiceMock = jest.fn();
jest.mock('../../src/services/IronGateValidator.js', () => ({
  IronGateValidator: { validateChoice: (...args: any[]) => validateChoiceMock(...args) },
}));

jest.mock('../../src/routes/dialogue-helpers.js', () => ({
  filterChoices: jest.fn(async () => []),
  processChoiceInTransaction: jest.fn(),
}));

const buildChooseResponseMock = jest.fn(() => ({ success: true }));
jest.mock('../../src/routes/dialogue-response-helpers.js', () => ({
  buildChooseResponse: (...args: any[]) => buildChooseResponseMock(...args),
  buildChoiceTelemetryEventData: jest.fn(() => ({})),
}));

jest.mock('../../src/routes/dialogue-speakers.js', () => ({
  resolveChunkSpeakers: jest.fn(async () => ({})),
}));
jest.mock('../../src/services/ReceiptRenderer.js', () => ({
  appendTBReceipt: jest.fn((node: any) => node),
}));
jest.mock('../../src/routes/dialogue-side-effects.js', () => ({
  handleAlignmentSideEffects: jest.fn(async () => undefined),
  handleBreakthroughSideEffects: jest.fn(async () => undefined),
  handleJoinMystery: jest.fn(async () => undefined),
}));
jest.mock('../../src/routes/dialogue-legacy.js', () => ({ handleLegacyChoiceIndex: jest.fn() }));

const getDialogueCursorMock = jest.fn();
jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    getDialogueCursor: (...args: any[]) => getDialogueCursorMock(...args),
    setDialogueCursor: jest.fn(async () => undefined),
    setDialogueChunkCursor: jest.fn(async () => undefined),
  },
}));

import { handleChoose } from '../../src/routes/dialogue-choose.js';
import { DialogueResolver } from '../../src/services/DialogueResolver.js';

function makeRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const CHUNK_ID = 'chunk-1';
const TREE_ID = 'tree-A';
const CHOICE_ID = 'choice-1';

function baseCurrentChunk(overrides: Partial<{ tree_id: string; revision: number }> = {}) {
  const leafKey = `nodeX:${CHOICE_ID}`;
  return {
    id: CHUNK_ID,
    tree_id: TREE_ID,
    chunk_key: 'ck1',
    nodes: {
      nodeX: {
        choices: [{ id: CHOICE_ID, next_node_id: leafKey }],
      },
    },
    leaves: {
      [leafKey]: { target_chunk: 'ck2', type: 'FREE' },
    },
    revision: 3,
    ...overrides,
  };
}

beforeEach(() => {
  (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockReset();
  resolveNextChunkMock.mockReset();
  validateChoiceMock.mockReset();
  getDialogueCursorMock.mockReset();
  buildChooseResponseMock.mockClear();

  validateChoiceMock.mockResolvedValue({ success: true, tbDeducted: 0 });
  resolveNextChunkMock.mockResolvedValue({
    chunk: { id: 'chunk-2', chunk_key: 'ck2', tree_id: TREE_ID, leaves: {} },
    currentNodeId: 'node-2',
    mergedNodes: { 'node-2': { is_end: true, choices: [] } },
  });
});

describe('handleChunkBoundaryChoice — tree revision resolution', () => {
  it('derives treeRevision from pinned (even when 0) after cursor validation', async () => {
    const currentChunk = baseCurrentChunk({ revision: 0 });
    (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockResolvedValue(currentChunk);
    getDialogueCursorMock.mockResolvedValue({
      active_dialogue_id: TREE_ID,
      pinned_tree_revision: 0,
      current_chunk_id: CHUNK_ID,
      current_node_id: 'nodeX',
      time_blocks: 5,
    });

    const req: any = {
      params: { id: CHUNK_ID },
      userId: 'user-1',
      body: { current_chunk_id: CHUNK_ID, choice_id: CHOICE_ID },
    };
    const res = makeRes();

    await handleChoose(req, res);

    expect(resolveNextChunkMock).toHaveBeenCalledTimes(1);
    const [, , , revisionArg] = resolveNextChunkMock.mock.calls[0];
    expect(revisionArg).toBe(0);
  });

  it('uses the cursor pinned revision for boundary when it matches the chunk revision', async () => {
    const currentChunk = baseCurrentChunk({ revision: 5 });
    (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockResolvedValue(currentChunk);
    getDialogueCursorMock.mockResolvedValue({
      active_dialogue_id: TREE_ID,
      pinned_tree_revision: 5,
      current_chunk_id: CHUNK_ID,
      current_node_id: 'nodeX',
      time_blocks: 5,
    });

    const req: any = {
      params: { id: CHUNK_ID },
      userId: 'user-1',
      body: { current_chunk_id: CHUNK_ID, choice_id: CHOICE_ID },
    };
    const res = makeRes();

    await handleChoose(req, res);

    const [, , , revisionArg] = resolveNextChunkMock.mock.calls[0];
    expect(revisionArg).toBe(5);
  });

  it('rejects with dialogue_tree_mismatch when currentChunk.tree_id differs from the player\'s active dialogue', async () => {
    const currentChunk = baseCurrentChunk({ tree_id: 'tree-A' });
    (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockResolvedValue(currentChunk);
    getDialogueCursorMock.mockResolvedValue({
      active_dialogue_id: 'tree-B',
      pinned_tree_revision: 1,
      current_chunk_id: CHUNK_ID,
      time_blocks: 5,
    });

    const req: any = {
      params: { id: CHUNK_ID },
      userId: 'user-1',
      body: { current_chunk_id: CHUNK_ID, choice_id: CHOICE_ID },
    };
    const res = makeRes();

    await handleChoose(req, res);

    expect(resolveNextChunkMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'dialogue_tree_mismatch' })
    );
  });

  it('rejects when the player has no active dialogue at all but the chunk carries a tree_id', async () => {
    const currentChunk = baseCurrentChunk({ tree_id: 'tree-A' });
    (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockResolvedValue(currentChunk);
    getDialogueCursorMock.mockResolvedValue({
      active_dialogue_id: null,
      pinned_tree_revision: 0,
      current_chunk_id: CHUNK_ID,
      time_blocks: 5,
    });

    const req: any = {
      params: { id: CHUNK_ID },
      userId: 'user-1',
      body: { current_chunk_id: CHUNK_ID, choice_id: CHOICE_ID },
    };
    const res = makeRes();

    await handleChoose(req, res);

    expect(resolveNextChunkMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects with dialogue_revision_mismatch when supplied chunk rev differs from pinned', async () => {
    const currentChunk = baseCurrentChunk({ revision: 2 });
    (DialogueResolver.loadChunkNodesAndLeaves as jest.Mock).mockResolvedValue(currentChunk);
    getDialogueCursorMock.mockResolvedValue({
      active_dialogue_id: TREE_ID,
      pinned_tree_revision: 7,
      current_chunk_id: CHUNK_ID,
      time_blocks: 5,
    });

    const req: any = {
      params: { id: CHUNK_ID },
      userId: 'user-1',
      body: { current_chunk_id: CHUNK_ID, choice_id: CHOICE_ID },
    };
    const res = makeRes();

    await handleChoose(req, res);

    expect(resolveNextChunkMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'dialogue_revision_mismatch' })
    );
  });
});
