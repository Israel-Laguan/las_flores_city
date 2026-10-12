import { afterAll, beforeAll } from '@jest/globals';
import pg from 'pg';
import { RevisionScopedLookup } from '@las-flores/api-runtime';
import { PgRevisionRepository } from '../../src/planning/PgRevisionRepository.js';
import { PgArtifactReader } from '../../src/runtime/PgArtifactReader.js';
import { PgRevisionReader } from '../../src/runtime/PgRevisionReader.js';
import { acquirePointerLock, deletePrefixedPublishRows } from '../helpers/pointerLock.js';
import { runtimeLookupContract } from '../helpers/runtimeLookupContract.js';

// SC-502: the shared runtime lookup contract against publish.* on Postgres, twice:
//   1. through the app pool (the production path today: oltpPool, privileged `las_flores`);
//   2. through a connection logged in as the `runtime` role, which has SELECT on `publish` and
//      nothing else. Passing there proves the adapters need no privilege beyond the seam grant.
// Fixtures are always PUBLISHED through planning's repository (the only writer).
//
// Collision avoidance: artifact names and revision notes start with `sc502_pgapp` / `sc502_pgrt`,
// which no other suite uses. The pointer is one global row, so the suite holds the shared advisory
// lock (helpers/pointerLock.ts) for its whole run; both contracts run inside that one lock.
const RUNTIME_URL = process.env.RUNTIME_DATABASE_URL || 'postgresql://runtime:dev_runtime@localhost:5434/las_flores';
const APP = 'sc502_pgapp';
const RT = 'sc502_pgrt';

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

runtimeLookupContract(
  'Postgres via the app pool',
  () => ({
    repo: new PgRevisionRepository(),
    lookup: new RevisionScopedLookup({ revisions: new PgRevisionReader(), artifacts: new PgArtifactReader() }),
  }),
  { slugPrefix: APP, reset: resetAll },
);

runtimeLookupContract(
  'Postgres as the runtime role (SELECT on publish only)',
  () => {
    const query = (text: string, params?: any[]) => runtime.query(text, params);
    return {
      repo: new PgRevisionRepository(),
      lookup: new RevisionScopedLookup({ revisions: new PgRevisionReader(query), artifacts: new PgArtifactReader(query) }),
    };
  },
  { slugPrefix: RT, reset: resetAll },
);
