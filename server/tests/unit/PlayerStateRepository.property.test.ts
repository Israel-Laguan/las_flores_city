import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';

// ============================================================
// PlayerStateRepository Property-Based Tests
//
// Feature: runtime-rewrite-dialogue-chunks
//
// Properties under test:
//   Property 8: Chunk state persistence
//
// Validates: Requirements 8.3
//
// Requirement 8.3: WHEN a player makes a choice that crosses a
// chunk boundary, THE System SHALL update both current_chunk_id
// and current_node_id atomically.
//
// Mocking strategy:
//   - A fake pg.PoolClient is constructed per test run with a
//     mocked `query` method so no real DB connection is needed.
//   - We inspect the SQL and bound parameters passed to
//     client.query to verify atomicity:
//       * Both fields are always SET in the same single query.
//       * The bound values for current_node_id and current_chunk_id
//         equal the inputs exactly.
//       * client.query is called exactly once (no split writes).
//
// Property 8 is split into three sub-properties that together
// cover Requirement 8.3 fully:
//
//   8a (setDialogueChunkCursor — no choiceEntry):
//     Both current_node_id and current_chunk_id appear in the
//     SET clause of the single UPDATE query.
//
//   8b (setDialogueChunkCursor — with choiceEntry):
//     Even when choices_made is also appended, both fields are
//     still updated atomically in the same query.
//
//   8c (initDialogueChunkState):
//     Both fields are set atomically in the INSERT … ON CONFLICT
//     DO UPDATE upsert, covering the dialogue-start case
//     (Requirement 8.2).
//
//   8d (values round-trip):
//     The exact chunkId and nodeId passed as arguments appear
//     at the correct parameter positions in the bound values
//     array — no transposition, no truncation, no coercion.
//
//   8e (single-call guarantee):
//     client.query is called exactly once for each cursor update,
//     which proves the write is a single atomic operation rather
//     than two separate queries that could be interleaved.
// ============================================================

// ── Imports ───────────────────────────────────────────────────

import {
  setDialogueChunkCursor,
  initDialogueChunkState,
} from '../../src/database/repositories/PlayerStateRepository.write.js';
import type pg from 'pg';

// ── Arbitraries ───────────────────────────────────────────────

/** Valid UUID — used for userId, treeId, chunkId. */
const uuidArb = (): fc.Arbitrary<string> => fc.uuid();

/** Valid node id — alphanumeric + underscore. */
const nodeIdArb = (): fc.Arbitrary<string> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), {
    minLength: 3,
    maxLength: 40,
  });

/**
 * A choice-entry record that can appear in the choiceEntry optional
 * argument of setDialogueChunkCursor.
 */
const choiceEntryArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    choice_id: fc.string({ minLength: 1, maxLength: 40 }),
    chunk_id: uuidArb(),
    timestamp: fc.date().map((d) => d.toISOString()),
  });

// ── Helpers ───────────────────────────────────────────────────

/**
 * Build a minimal fake pg.PoolClient whose `query` method is a
 * fresh jest.fn() for each call so call counts stay isolated.
 */
function makeFakeClient(): pg.PoolClient & { query: jest.Mock } {
  return {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  } as unknown as pg.PoolClient & { query: jest.Mock };
}

// ── Both fields updated in single UPDATE (no choiceEntry) ────
//
// setDialogueChunkCursor with no choiceEntry MUST issue exactly
// one SQL statement that sets both current_node_id AND
// current_chunk_id.
//
// Validates: Requirement 8.3
// ─────────────────────────────────────────────────────────────

describe('Chunk state persistence', () => {
  describe('8a — setDialogueChunkCursor (no choiceEntry): both fields SET in one query', () => {
    it('single UPDATE sets both current_node_id and current_chunk_id', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(), // userId
          uuidArb(), // treeId
          uuidArb(), // chunkId
          nodeIdArb(), // nodeId
          async (userId, treeId, chunkId, nodeId) => {
            const client = makeFakeClient();

            await setDialogueChunkCursor(client, userId, treeId, chunkId, nodeId);

            // 8e: exactly one query was issued
            expect(client.query).toHaveBeenCalledTimes(1);

            const [sql] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];

            // 8a: the single SQL must set BOTH columns in the SET clause
            expect(sql).toMatch(/current_node_id\s*=\s*\$1/i);
            expect(sql).toMatch(/current_chunk_id\s*=\s*\$2/i);

            // Must be an UPDATE statement (not an INSERT or SELECT)
            expect(sql.trim().toUpperCase()).toMatch(/^UPDATE\s/i);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  });

  // ── Both fields updated in single UPDATE (with choiceEntry) ─
  //
  // Even when a choiceEntry is appended to choices_made in the same
  // statement, the update MUST still set both fields atomically in
  // a single query.
  //
  // Validates: Requirement 8.3
  // ─────────────────────────────────────────────────────────────

  describe('8b — setDialogueChunkCursor (with choiceEntry): both fields SET in one query', () => {
    it('single UPDATE sets both fields even when appending to choices_made', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          choiceEntryArb(),
          async (userId, treeId, chunkId, nodeId, choiceEntry) => {
            const client = makeFakeClient();

            await setDialogueChunkCursor(client, userId, treeId, chunkId, nodeId, choiceEntry);

            // 8e: exactly one query
            expect(client.query).toHaveBeenCalledTimes(1);

            const [sql] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];

            // 8b: both columns appear in the SET clause
            expect(sql).toMatch(/current_node_id\s*=\s*\$1/i);
            expect(sql).toMatch(/current_chunk_id\s*=\s*\$2/i);

            // choices_made should also be present (this variant appends to it)
            expect(sql).toMatch(/choices_made/i);

            // Must be an UPDATE statement (not a separate INSERT)
            expect(sql.trim().toUpperCase()).toMatch(/^UPDATE\s/i);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  });

  // ── initDialogueChunkState also persists both fields ─────────
  //
  // The dialogue-start upsert (initDialogueChunkState) MUST set
  // both current_node_id AND current_chunk_id in a single
  // INSERT … ON CONFLICT DO UPDATE statement (Requirement 8.2 →
  // feeds into 8.3 for the initial boundary crossing).
  //
  // Validates: Requirement 8.3
  // ─────────────────────────────────────────────────────────────

  describe('8c — initDialogueChunkState: both fields SET in one upsert', () => {
    it('INSERT … ON CONFLICT upsert sets both current_node_id and current_chunk_id', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          uuidArb(),
          async (userId, treeId, nodeId, chunkId) => {
            const client = makeFakeClient();

            await initDialogueChunkState(client, userId, treeId, nodeId, chunkId);

            // 8e: exactly one query
            expect(client.query).toHaveBeenCalledTimes(1);

            const [sql] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];

            // Must be an INSERT (the upsert form)
            expect(sql).toMatch(/INSERT\s+INTO/i);

            // Both columns must appear in the INSERT column list
            expect(sql).toMatch(/current_node_id/i);
            expect(sql).toMatch(/current_chunk_id/i);

            // Both columns must also appear in the ON CONFLICT DO UPDATE clause
            // so they are updated even when the row already exists
            expect(sql).toMatch(/ON\s+CONFLICT/i);
            expect(sql).toMatch(/DO\s+UPDATE/i);
            // After DO UPDATE, both fields must be assigned
            const doUpdatePart = sql.split(/DO\s+UPDATE/i)[1] ?? '';
            expect(doUpdatePart).toMatch(/current_node_id/i);
            expect(doUpdatePart).toMatch(/current_chunk_id/i);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  });

  // ── Values round-trip without transposition ──────────────────
  //
  // The bound values [$nodeId, $chunkId, ...] MUST appear at the
  // correct positions matching the SET clause order so that
  // current_node_id always gets nodeId and current_chunk_id always
  // gets chunkId — never swapped.
  //
  // For setDialogueChunkCursor (no choiceEntry):
  //   $1 = nodeId, $2 = chunkId
  //
  // Validates: Requirement 8.3
  // ─────────────────────────────────────────────────────────────

  describe('8d — setDialogueChunkCursor: values match correct parameter positions', () => {
    it('nodeId is bound to $1 and chunkId is bound to $2 (no transposition)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          async (userId, treeId, chunkId, nodeId) => {
            // Skip degenerate case where nodeId === chunkId (can't distinguish)
            fc.pre(nodeId !== chunkId);

            const client = makeFakeClient();

            await setDialogueChunkCursor(client, userId, treeId, chunkId, nodeId);

            const [sql, params] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];

            // SQL: SET current_node_id = $1, current_chunk_id = $2
            // params[0] = $1 = nodeId
            // params[1] = $2 = chunkId
            expect(sql).toMatch(/current_node_id\s*=\s*\$1/i);
            expect(sql).toMatch(/current_chunk_id\s*=\s*\$2/i);

            expect(params[0]).toBe(nodeId);
            expect(params[1]).toBe(chunkId);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });

    it('initDialogueChunkState: nodeId is $3 and chunkId is $4 in INSERT VALUES', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(), // userId = $1
          uuidArb(), // treeId = $2
          nodeIdArb(), // nodeId = $3
          uuidArb(), // chunkId = $4
          async (userId, treeId, nodeId, chunkId) => {
            fc.pre(nodeId !== chunkId);

            const client = makeFakeClient();

            await initDialogueChunkState(client, userId, treeId, nodeId, chunkId);

            const [, params] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];

            // initDialogueChunkState signature: (client, userId, treeId, nodeId, chunkId)
            // So: params = [userId, treeId, nodeId, chunkId]
            // $1=userId, $2=treeId, $3=nodeId, $4=chunkId
            expect(params[0]).toBe(userId);
            expect(params[1]).toBe(treeId);
            expect(params[2]).toBe(nodeId);
            expect(params[3]).toBe(chunkId);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  });

  // ── Atomicity guarantee — single call only ───────────────────
  //
  // The write MUST be issued as a single client.query call.
  // Two separate queries for chunk_id and node_id would mean a
  // partial state could be observed between them, violating the
  // atomicity requirement.
  //
  // Validates: Requirement 8.3
  // ─────────────────────────────────────────────────────────────

  describe('8e — single-call atomicity: exactly one client.query per cursor update', () => {
    it('setDialogueChunkCursor without choiceEntry issues exactly one query', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          async (userId, treeId, chunkId, nodeId) => {
            const client = makeFakeClient();

            await setDialogueChunkCursor(client, userId, treeId, chunkId, nodeId);

            expect(client.query).toHaveBeenCalledTimes(1);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });

    it('setDialogueChunkCursor with choiceEntry issues exactly one query', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          choiceEntryArb(),
          async (userId, treeId, chunkId, nodeId, choiceEntry) => {
            const client = makeFakeClient();

            await setDialogueChunkCursor(client, userId, treeId, chunkId, nodeId, choiceEntry);

            expect(client.query).toHaveBeenCalledTimes(1);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });

    it('initDialogueChunkState issues exactly one query', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb(),
          uuidArb(),
          nodeIdArb(),
          uuidArb(),
          async (userId, treeId, nodeId, chunkId) => {
            const client = makeFakeClient();

            await initDialogueChunkState(client, userId, treeId, nodeId, chunkId);

            expect(client.query).toHaveBeenCalledTimes(1);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    });
  });
});
