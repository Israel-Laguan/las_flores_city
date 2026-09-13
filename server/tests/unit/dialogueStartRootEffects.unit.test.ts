import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ============================================================
// Unit tests for /dialogue/start root-effect application
//
// Root `stat_set` deltas are additive, so they must be applied exactly
// ONCE per dialogue run:
//   - a mid-dialogue restart must NOT re-apply them (stat farming), and
//   - two CONCURRENT first starts must not both apply them.
//
// The concurrency guarantee comes from reading the cursor with
// `SELECT ... FOR UPDATE` inside the same transaction that writes it
// (PlayerStateRepository.lockDialogueCursor). The fake client below
// models that lock: a `FOR UPDATE` query blocks until the transaction
// holding the row lock commits, after which the waiter sees the
// committed `active_dialogue_id`.
// ============================================================

const DIALOGUE_ID = 'd-1';
const USER_ID = 'u-1';
const CHARACTER_ID = 'c-1';
const SCENE_ID = 's-1';
const ROOT_TRUST_DELTA = 5;
const TREE_CONTENT_URL = 's3://content/trees/d-1.json';

// In-memory "player_states" row.
const db: { activeDialogueId: string | null; stats: Record<string, number> } = {
  activeDialogueId: null,
  stats: {},
};

// Serializes transactions the way a row lock does.
let rowLockTail: Promise<void> = Promise.resolve();
async function acquireRowLock(): Promise<() => void> {
  const previous = rowLockTail;
  let release!: () => void;
  rowLockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

// Controls whether a start chunk row exists (chunk path vs. tree fallback path).
let hasStartChunk = true;

// Captured SQLs executed inside withOLTPTransaction (batches for per-tx assertions).
// Per-invocation batches: txQueryBatches[0] is queries from the FIRST withOLTPTransaction(callback) call
// (the rev-read + chunk-read snapshot in handleStartDialogue). The pin + node/chunk writes (incl.
// the INSERT with pinned_tree_revision) happen atomically in the later effects tx (under player lock).
// Mocks for set/init now emit representative queries containing the INSERT so the atomicity can be asserted.
let txQueryBatches: string[][] = [];

const withOLTPTransactionMock = jest.fn(async (callback: any) => {
  const txQueries: string[] = [];
  let release: (() => void) | null = null;
  const client = {
    async query(sql: string, params?: any[]) {
      txQueries.push(sql);
      if (/FOR UPDATE/i.test(sql) && !release) {
        release = await acquireRowLock();
      }
      if (sql.includes('SELECT revision FROM dialogue_trees')) {
        return { rows: [{ revision: 1 }] };
      }
      if (sql.includes('FROM dialogue_chunks')) {
        return { rows: hasStartChunk ? [{ id: 'chunk-1', chunk_key: 'root' }] : [] };
      }
      return { rows: [] };
    },
  };
  try {
    return await callback(client);
  } finally {
    // COMMIT / ROLLBACK releases the row lock.
    release?.();
    txQueryBatches.push(txQueries);
  }
});

const queryOLTPMock = jest.fn(async (sql: string) => {
  // resolveDialogueTree step 1: the scene's ordered dialogue ids.
  // M32: this query no longer joins dialogue_trees (the `nodes` JSONB column
  // it used to probe for `speaker_id` was dropped); it returns ids only.
  if (sql.includes('FROM scenes s')) {
    return { rows: [{ dialogue_id: DIALOGUE_ID }] };
  }
  // resolveDialogueTree fallback: trees owned by the character.
  if (sql.includes('FROM dialogue_trees') && sql.includes('character_id')) {
    return { rows: [{ id: DIALOGUE_ID }] };
  }
  // resolveDialogueTree step 2 (loadTreeWithNodes): the tree row, which now
  // carries a `content_url` pointer instead of an inline `nodes` map.
  if (sql.includes('FROM dialogue_trees')) {
    return {
      rows: [
        {
          id: DIALOGUE_ID,
          name: 'test tree',
          description: null,
          start_node_id: 'root',
          metadata: {},
          content_url: TREE_CONTENT_URL,
        },
      ],
    };
  }
  return { rows: [] };
});

  // queryContent is used by resolver internals (CDN metadata + overlays)
  // but /dialogue/start reads rev + start chunk via client.query inside withOLTPTransaction (OLTP primary)
  // for read-after-write visibility after compile. Pin/node/chunk written together in effects tx.
  const queryContentMock = jest.fn(async (_sql: string) => ({ rows: [] }));


jest.mock('@las-flores/infra', () => ({
  queryOLTP: queryOLTPMock,
  queryOLAP: jest.fn(),
  queryContent: queryContentMock,
  withOLTPTransaction: withOLTPTransactionMock,
  // M48: resolveDialogueTree preloads the speaker's relationship row via
  // the pool-based getter; empty result = missing row (fail-closed gates).
  oltpPool: {
    query: jest.fn(async () => ({ rows: [] })),
  },
}));

const rootNode = {
  id: 'root',
  // resolveDialogueTree requires a node spoken by the requested character;
  // this used to be asserted in SQL against dialogue_trees.nodes.
  speaker_id: CHARACTER_ID,
  text: 'hello',
  effects: { stat_set: { adeyemi_trust: ROOT_TRUST_DELTA } },
  choices: [],
};

// M32/M23: the tree's node map is fetched from the CDN via `content_url`
// rather than read from the dropped `dialogue_trees.nodes` column.
jest.mock('../../src/services/contentFetch.js', () => ({
  fetchNodesFromContentUrl: jest.fn(async () => ({ root: rootNode })),
}));

jest.mock('../../src/services/DialogueResolver.js', () => ({
  DialogueResolver: {
    resolveChunkForUser: jest.fn(async () => ({
      currentNodeId: 'root',
      mergedNodes: { root: rootNode },
      chunk: { id: 'chunk-1', chunk_key: 'root', leaves: {} },
    })),
    resolveTreeForUser: jest.fn(async () => ({
      rootId: 'root',
      nodes: { root: rootNode },
    })),
  },
}));

jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    getFullState: jest.fn(async () => ({
      story_beat: 'prologue',
      flags: {},
      state: {},
      stats: {},
      time_blocks: 0,
    })),
    getForChoiceFilter: jest.fn(async () => null),
    getDialogueCursor: jest.fn(async () => ({
      current_node_id: 'root',
      active_dialogue_id: db.activeDialogueId,
      time_blocks: 0,
    })),
    // Mirrors the real implementation: takes the row lock through the
    // transaction's client, THEN reads the (committed) cursor.
    lockDialogueCursor: jest.fn(async (client: any, userId: string) => {
      await client.query(
        'SELECT active_dialogue_id FROM player_states WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      return { active_dialogue_id: db.activeDialogueId };
    }),
    setDialogueCursor: jest.fn(async (client: any, _userId: string, _nodeId: string, dialogueId: string | null) => {
      db.activeDialogueId = dialogueId;
      // Emit representative SQL so txQueryBatches can assert cursor writes happened in this tx.
      await client.query('UPDATE player_states SET active_dialogue_id = $1', [dialogueId]);
    }),
    initDialogueChunkState: jest.fn(async (client: any, _userId: string, _treeId: string, nodeId: string, chunkId: string, pinnedRev: number) => {
      // Emit the INSERT that the real impl performs (with pin) so the test can assert
      // that pin + node/chunk state writes are together (atomic) in the effects tx.
      await client.query(
        `INSERT INTO player_dialogue_states (user_id, dialogue_tree_id, current_node_id, current_chunk_id, choices_made, pinned_tree_revision)
         VALUES ($1, $2, $3, $4, '[]', $5)
         ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
           current_node_id = EXCLUDED.current_node_id,
           current_chunk_id = EXCLUDED.current_chunk_id,
           choices_made = '[]',
           started_at = NOW(),
           pinned_tree_revision = EXCLUDED.pinned_tree_revision`,
        ['u', 't', nodeId, chunkId, pinnedRev]
      );
    }),
    mergeStatsClamped: jest.fn(async (_client: any, _userId: string, statSet: Record<string, number>) => {
      for (const [key, delta] of Object.entries(statSet)) {
        db.stats[key] = (db.stats[key] ?? 0) + delta;
      }
    }),
    mergeFlags: jest.fn(async () => {}),
    mergeState: jest.fn(async () => {}),
    setStoryBeat: jest.fn(async () => {}),
    modifyBalance: jest.fn(async () => {}),
  },
}));

let handleStartDialogue: (req: any, res: any) => Promise<any>;

function makeReq() {
  return { userId: USER_ID, body: { characterId: CHARACTER_ID, sceneId: SCENE_ID } } as any;
}

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe.each([
  ['chunk path', true],
  ['tree fallback path', false],
])('/dialogue/start root effects — %s', (_label, chunkExists) => {
  beforeEach(async () => {
    db.activeDialogueId = null;
    db.stats = {};
    rowLockTail = Promise.resolve();
    hasStartChunk = chunkExists;
    queryOLTPMock.mockClear();
    queryContentMock.mockClear();
    withOLTPTransactionMock.mockClear();
    txQueryBatches = [];
    jest.resetModules();
    const mod = await import('../../src/routes/dialogue-start.js');
    handleStartDialogue = mod.handleStartDialogue;
  });

  it('reads the revision and start chunk inside withOLTPTransaction (snapshot for start)', async () => {
    await handleStartDialogue(makeReq(), makeRes());

    // Rev + start-chunk read inside withOLTPTransaction for read-after-write
    // visibility vs concurrent compile. Pin+node+chunk are written atomically
    // later (under player lock) in the effects tx so a pin is never observable
    // without its matching state. The effects-tx INSERT includes the pinned rev.
    expect(withOLTPTransactionMock).toHaveBeenCalled();
    // The *first* withOLTP call (in handleStartDialogue) performs the rev/chunk
    // SELECTs for consistent snapshot + path decision. No pin write here.
    expect(txQueryBatches.length).toBeGreaterThanOrEqual(1);
    const firstTx = txQueryBatches[0];
    expect(firstTx.some((q) => q.includes('SELECT revision FROM dialogue_trees'))).toBe(true);
    expect(firstTx.some((q) => q.includes('FROM dialogue_chunks'))).toBe(true);
    // No pin write in the read snapshot tx.
    expect(firstTx.some((q) => /pinned_tree_revision/i.test(q))).toBe(false);
    // Node/chunk writes (incl. pin) live in later tx; first must not contain them.
    expect(firstTx.some((q) => /INSERT INTO player_dialogue_states/i.test(q))).toBe(false);
    // No direct queryContent for these.

    // Invocation contract check: the effects tx (under player lock) must include the
    // dialogue-state write (with pin) via the repository. This asserts the route
    // performs the write inside the tx. It does not prove the repo implementation's
    // SQL cannot be split, because the INSERT text is supplied by the test mock.
    expect(txQueryBatches.length).toBeGreaterThanOrEqual(2);
    const effectsTx = txQueryBatches[1];
    expect(effectsTx.some((q) => /INSERT INTO player_dialogue_states[\s\S]*pinned_tree_revision/i.test(q))).toBe(true);
    expect(queryContentMock).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT revision FROM dialogue_trees'),
      expect.anything()
    );
  });

  it('applies root stat effects on a fresh run', async () => {
    const res = makeRes();
    await handleStartDialogue(makeReq(), res);

    expect(res.statusCode).toBe(201);
    expect(db.stats.adeyemi_trust).toBe(ROOT_TRUST_DELTA);
  });

  it('does not re-apply root stat effects on a mid-dialogue restart', async () => {
    await handleStartDialogue(makeReq(), makeRes());
    await handleStartDialogue(makeReq(), makeRes());
    await handleStartDialogue(makeReq(), makeRes());

    expect(db.stats.adeyemi_trust).toBe(ROOT_TRUST_DELTA);
  });

  it('applies root stat effects once when two first starts race', async () => {
    await Promise.all([
      handleStartDialogue(makeReq(), makeRes()),
      handleStartDialogue(makeReq(), makeRes()),
    ]);

    // Without the in-transaction FOR UPDATE claim both requests would
    // observe a null cursor and each add the root delta.
    expect(db.stats.adeyemi_trust).toBe(ROOT_TRUST_DELTA);
  });
});
