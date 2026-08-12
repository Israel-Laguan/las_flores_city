import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ============================================================
// persistChunkBoundaryState — must persist the OWNING dialogue
// tree id, not the chunk id the client posts as /dialogue/:id
//
// The client drives chunked dialogue via
// `makeDialogueChoice(currentChunkId, ...)` /
// `makeDialogueChoiceBackground(currentChunkId, ...)`, so the
// route param `:id` on POST /dialogue/:id/choose is a
// `dialogue_chunks.id`, never a `dialogue_trees.id`. Writing that
// chunk id to `player_states.active_dialogue_id` (FK → dialogue_trees)
// raises `player_states_active_dialogue_id_fkey` — the uncaught 500
// seen on chunk-boundary crossings. The fix: persist the chunk's
// owning tree (`dialogue_chunks.tree_id`) for both cursor writes.
//
// Mirrors dialogueChoice.rollback.unit.test.ts and mocks every
// DB/Redis-bearing module dialogue-choose transitively imports
// (AGENTS.md rule 7).
// ============================================================

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [] })),
  queryOLAP: jest.fn(async () => null),
  deleteCache: jest.fn(async () => true),
  withOLTPTransaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => {
    const fakeClient = { query: jest.fn(async () => ({ rows: [] })) };
    return cb(fakeClient as any);
  }),
}));

jest.mock('../../src/services/DialogueResolver.js', () => ({ DialogueResolver: {} }));
jest.mock('../../src/services/IronGateValidator.js', () => ({
  IronGateValidator: { validateChoice: jest.fn() },
}));
jest.mock('../../src/routes/dialogue-helpers.js', () => ({
  filterChoices: jest.fn(async () => []),
  processChoiceInTransaction: jest.fn(),
}));
jest.mock('../../src/routes/dialogue-response-helpers.js', () => ({}));
jest.mock('../../src/routes/dialogue-speakers.js', () => ({ resolveChunkSpeakers: jest.fn() }));
jest.mock('../../src/services/ReceiptRenderer.js', () => ({ appendTBReceipt: jest.fn() }));
jest.mock('../../src/routes/dialogue-side-effects.js', () => ({
  handleAlignmentSideEffects: jest.fn(async () => undefined),
  handleBreakthroughSideEffects: jest.fn(async () => undefined),
  handleJoinMystery: jest.fn(async () => undefined),
}));
jest.mock('../../src/routes/dialogue-legacy.js', () => ({ handleLegacyChoiceIndex: jest.fn() }));

const setDialogueCursorMock = jest.fn(async () => undefined);
const setDialogueChunkCursorMock = jest.fn(async () => undefined);
jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    setDialogueCursor: (...args: any[]) => setDialogueCursorMock(...args),
    setDialogueChunkCursor: (...args: any[]) => setDialogueChunkCursorMock(...args),
  },
}));

import { persistChunkBoundaryState } from '../../src/routes/dialogue-choose.js';
import { withOLTPTransaction } from '@las-flores/infra';

beforeEach(() => {
  setDialogueCursorMock.mockClear();
  setDialogueChunkCursorMock.mockClear();
  (withOLTPTransaction as jest.Mock).mockClear();
});

describe('persistChunkBoundaryState', () => {
  it('persists the owning dialogue tree id, not the chunk id passed as :id', async () => {
    const userId = 'user-1';
    const treeId = 'tree-abc-def';
    const chunkId = 'chunk-xyz';
    const nextNodeId = 'node-b';
    const nextChunkId = 'chunk-next';
    const choiceId = 'choice-1';

    await persistChunkBoundaryState(userId, treeId, nextNodeId, nextChunkId, choiceId, chunkId);

    // The writes run inside a transaction.
    expect(withOLTPTransaction).toHaveBeenCalledTimes(1);

    // active_dialogue_id receives the tree id, never the chunk id.
    expect(setDialogueCursorMock).toHaveBeenCalledTimes(1);
    const cursorCall = setDialogueCursorMock.mock.calls[0];
    expect(cursorCall[0]).toBeTruthy(); // the transaction client
    expect(cursorCall[1]).toBe(userId);
    expect(cursorCall[2]).toBe(nextNodeId);
    expect(cursorCall[3]).toBe(treeId);
    expect(cursorCall[3]).not.toBe(chunkId);

    // player_dialogue_states is matched by the same tree id.
    const chunkCursorCall = setDialogueChunkCursorMock.mock.calls[0];
    expect(chunkCursorCall[1]).toBe(userId);
    expect(chunkCursorCall[2]).toBe(treeId);
    expect(chunkCursorCall[3]).toBe(nextChunkId);
    expect(chunkCursorCall[4]).toBe(nextNodeId);
    expect(chunkCursorCall[5]).toEqual({ choice_id: choiceId, chunk_id: chunkId, timestamp: expect.any(String) });
  });
});