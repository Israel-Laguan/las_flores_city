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

const withOLTPTransactionMock = jest.fn(async (callback: any) => {
  let release: (() => void) | null = null;
  const client = {
    async query(sql: string) {
      if (/FOR UPDATE/i.test(sql) && !release) {
        release = await acquireRowLock();
      }
      return { rows: [] };
    },
  };
  try {
    return await callback(client);
  } finally {
    // COMMIT / ROLLBACK releases the row lock.
    release?.();
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
  if (sql.includes('FROM dialogue_chunks')) {
    return { rows: hasStartChunk ? [{ id: 'chunk-1', chunk_key: 'root' }] : [] };
  }
  return { rows: [] };
});

jest.mock('@las-flores/infra', () => ({
  queryOLTP: queryOLTPMock,
  queryOLAP: jest.fn(),
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
    setDialogueCursor: jest.fn(async (_client: any, _userId: string, _nodeId: string, dialogueId: string | null) => {
      db.activeDialogueId = dialogueId;
    }),
    initDialogueChunkState: jest.fn(async () => {}),
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

import { handleStartDialogue } from '../../src/routes/dialogue-start.js';

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
  beforeEach(() => {
    db.activeDialogueId = null;
    db.stats = {};
    rowLockTail = Promise.resolve();
    hasStartChunk = chunkExists;
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
