import { afterAll, beforeAll } from '@jest/globals';
import pg from 'pg';
import { RevisionScopedLookup } from '@las-flores/api-runtime';
import { PgRevisionRepository } from '../../src/planning/PgRevisionRepository.js';
import { PgArtifactReader } from '../../src/runtime/PgArtifactReader.js';
import { PgRevisionReader } from '../../src/runtime/PgRevisionReader.js';
import { acquirePointerLock, deletePrefixedPublishRows } from '../helpers/pointerLock.js';
import { sessionPinContract } from '../helpers/sessionPinContract.js';

// SC-504: the client-owned session-pin contract on publish.* in Postgres, over the app pool and
// over a connection logged in as the `runtime` role (SELECT on publish only).
// Collision avoidance: artifact names / revision notes start with `sc504_pgapp` / `sc504_pgrt`.
// The pointer is one global row: the suite holds the shared advisory lock for its whole run.
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const APP = 'sc504_pgapp';
const RT = 'sc504_pgrt';

let release: () => Promise<void>;
let runtime: pg.Client;
const resetAll = async () => {
  await deletePrefixedPublishRows(APP);
  await deletePrefixedPublishRows(RT);
};

beforeAll(async () => {
  release = await acquirePointerLock();
  runtime = new pg.Client({ connectionString: RUNTIME_URL, connectionTimeoutMillis: 5000 });
  await runtime.connect();
  await resetAll();
});
afterAll(async () => {
  try {
    await resetAll();
  } finally {
    await runtime?.end();
    await release();
  }
});

sessionPinContract(
  'Postgres via the app pool',
  () => {
    const revisions = new PgRevisionReader();
    return { repo: new PgRevisionRepository(), revisions, lookup: new RevisionScopedLookup({ revisions, artifacts: new PgArtifactReader() }) };
  },
  { slugPrefix: APP, reset: resetAll },
);

sessionPinContract(
  'Postgres as the runtime role',
  () => {
    const query = (text: string, params?: any[]) => runtime.query(text, params);
    const revisions = new PgRevisionReader(query);
    return { repo: new PgRevisionRepository(), revisions, lookup: new RevisionScopedLookup({ revisions, artifacts: new PgArtifactReader(query) }) };
  },
  { slugPrefix: RT, reset: resetAll },
);
