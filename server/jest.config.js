/**
 * Jest configuration.
 *
 * Integration tests are split into two projects because they share ONE Postgres
 * instance, and two classes of interference were proven:
 *
 *  - integration-schema (maxWorkers: 1): every suite that runs DDL
 *    (`applyMigration(...)`, `migrateContent()`) plus every *read-only*
 *    schema-assertion suite. Read-only suites have to run in the same serial
 *    phase as the mutators: `withSchemaLock` serialises mutator-vs-mutator but
 *    can never exclude a reader that takes no lock, so a reader running while
 *    `086_content_plans_rejected.sql` has dropped/re-added
 *    `content_plans_status_check`, or while `066_claims.sql` has dropped and
 *    re-added the `claim_transitions` CHECKs, sees a transient schema.
 *    `migrateContent()` additionally takes ACCESS EXCLUSIVE on `dialogue_trees`
 *    (drop/add 3 FK constraints), which blocks every concurrent dialogue read.
 *  - integration-data: everything else, parallel.
 *
 * `npm run test:integration` runs the two phases as two separate jest
 * invocations (schema first, data second) so ordering is guaranteed — Jest does
 * NOT guarantee project ordering within a single invocation.
 */

/** Options shared verbatim by every project. */
const base = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@las-flores/shared$': '<rootDir>/../shared/src/index.ts',
    '^@las-flores/infra$': '<rootDir>/../infra/src/index.ts',
    '^@las-flores/api-contracts$': '<rootDir>/../api/contracts/src/index.ts',
    '^@las-flores/api-planning$': '<rootDir>/../api/planning/src/index.ts',
  },
  transformIgnorePatterns: ['/node_modules/(?!@las-flores/shared/|@las-flores/infra/)'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: ['**/*.test.ts'],
  testTimeout: 15000,
  // Auto-clean mocks between tests so parallel worker reuse can never leak
  // spies (e.g. process.cwd, fs.promises.*, console.warn) or stale call
  // counts across test files.  restoreMocks runs jest.restoreAllMocks()
  // before every test — restoring any jest.spyOn() spy to its original
  // implementation.  clearMocks runs jest.clearAllMocks() before every
  // test — resetting mock.calls / mock.results so assertion counts stay
  // scoped to the current test.  Neither option affects jest.mock()
  // factory implementations, so module-level auto-mocks are preserved.
  clearMocks: true,
  restoreMocks: true,
  globalSetup: '<rootDir>/tests/globalSetup.cjs',
  globalTeardown: '<rootDir>/tests/globalTeardown.cjs',
};

/**
 * Integration suites that mutate schema. Keep this list in sync with reality —
 * a new DDL suite added to `tests/integration/` must be added here, otherwise it
 * runs in the parallel data phase and can break the read-only schema assertions.
 */
const SCHEMA_SUITES = [
  'adeyemi_arc.test.ts',
  // Suites that CREATE TABLE in beforeAll under withSchemaLock. They are DDL
  // mutators just like the applyMigration suites below, so they belong in this
  // serial phase: `critique_annotations` and `conflict_reports` are read by
  // sibling data-phase suites (graph-intake selects from critique_annotations,
  // plans-intake deletes from it), and on a fresh DB a reader can hit 42P01
  // while a parallel worker is still mid-create.
  'ai-critique.test.ts',
  'chat-apply-delta.integration.test.ts',
  'graph-critique.integration.test.ts',
  'conflict-detector.test.ts',
  'aftermath.worker.test.ts',
  'api-contract.test.ts',
  'archive-simulation.test.ts',
  'breakthrough.concurrency.test.ts',
  'claims-lifecycle.test.ts',
  'dialogue-resolver.test.ts',
  'dialogue-speakers.test.ts',
  'in-flight-protection.test.ts',
  'job-runs.resume.test.ts',
  'leaderboard.simulation.test.ts',
  'migration.drift.test.ts',
  'move.test.ts',
  'mvw.integration.test.ts',
  'paypal-webhook.test.ts',
  'plan-cli-lifecycle.integration.test.ts',
  'revision-rollback.test.ts',
  'shop.test.ts',
  'story-beat-pipeline.integration.test.ts',
  'story-builder-migration-audit.test.ts',
  'story-builder-plan-pipeline.test.ts',
  'vault.test.ts',
  // SC-106 negative-permission suite: creates and DROPs a probe table in the
  // planning schema through its own raw `pg` clients logged in as the planning
  // role, so it cannot take the oltpPool-backed withSchemaLock advisory lock.
  'runtime-planning-permissions.test.ts',
  // Read-only schema assertions — must observe a settled schema, never a gap.
  'database-constraints.test.ts',
  'migration.schema.test.ts',
  'migration.test.ts',
];

const INTEGRATION_DIR = '<rootDir>/tests/integration';
// testMatch takes micromatch GLOBS (not regex), so the schema suite list is
// expanded as a brace alternative; the data project is the full glob minus the
// same list via testPathIgnorePatterns.
const SCHEMA_GLOB = `${INTEGRATION_DIR}/{${SCHEMA_SUITES.join(',')}}`;
const SCHEMA_IGNORE = SCHEMA_SUITES.map((f) => `${INTEGRATION_DIR}/${f}`);

export default {
  // Repeated at the top level on purpose: under `projects`, Jest's per-project
  // `testTimeout` is not propagated to the worker test framework (observed:
  // `Exceeded timeout of 5000 ms` — the Jest default — for suites that pass
  // under the previous flat config). The top-level value is what the workers
  // actually use; the per-project copies in `base` are kept so each project is
  // self-describing.
  testTimeout: 15000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts', '<rootDir>/tests/smoke/**/*.test.ts'] },
    { ...base, displayName: 'integration-schema', maxWorkers: 1, testMatch: [SCHEMA_GLOB] },
    {
      ...base,
      displayName: 'integration-data',
      testMatch: [`${INTEGRATION_DIR}/**/*.test.ts`],
      testPathIgnorePatterns: SCHEMA_IGNORE,
    },
  ],
};
