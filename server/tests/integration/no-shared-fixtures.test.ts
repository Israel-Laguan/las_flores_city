/**
 * Guard rail: no shared fixture UUIDs across integration suites.
 *
 * Integration suites share ONE Postgres instance and, within the
 * `integration-data` project, run in parallel workers. When two suites use the
 * same fixture UUID, one suite's `afterAll` (frequently `DELETE FROM users`)
 * deletes a row another worker is still using, producing 401/404 flake that
 * cannot be reproduced in isolation.
 *
 * AGENTS.md already requires every test fixture to declare a dedicated UUID
 * plus a collision-avoidance comment; this test enforces the first half
 * mechanically. The correct pattern (see
 * `d2-choice-reachability.test.ts`) is a private prefix block per suite.
 *
 * Only `tests/integration/**` is scanned. `tests/unit/**` and `tests/smoke/**`
 * suites are exempt: they use in-memory doubles, never a row, so a repeated
 * literal there is a readability wart, not an isolation hazard.
 *
 * If you add a UUID that this test flags, give the suite its own prefix block
 * (e.g. `d2000000-*`) rather than adding an entry to ALLOWLIST — unless the
 * shared value is a documented *real content* entity that the suite genuinely
 * must reference, which is the only reason an entry may exist.
 */
import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const INTEGRATION_DIR = path.resolve(process.cwd(), 'tests/integration');

const UUID_PATTERN =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

/**
 * Literals that are deliberately shared, each with the reason it cannot be
 * re-pointed at a synthetic value. Keep this list short — every entry is debt.
 *
 * Keyed by lowercase UUID. Entries added during the PR #135 review-fix pass are
 * marked `[pre-existing]`; they are latent interference (they only bite when a
 * sibling worker is mid-test) and were left in place so the branch did not
 * destabilise the suites it touches. Fix each by giving one side its own
 * prefix block.
 */
const ALLOWLIST: Record<string, string> = {
  // The seeded admin (`.env` ADMIN_USER_ID). Content/graph suites reference the
  // real admin user because admin-only endpoints reject every other role, so a
  // synthetic admin row would be a second admin. Suites must never DELETE it.
  '00000000-0000-0000-0000-000000000001':
    'seeded admin user — referenced by admin-only endpoint suites; never deleted by them',

  // [pre-existing] Real content scene/district/etc. ids reused as fixtures by
  // more than one suite. `move.test.ts` already documents this drift.
  'c3d4e5f6-a7b8-9012-cdef-123456789012':
    '[pre-existing] real content scene id reused as a fixture in 4 suites',
  '550e8400-e29b-41d4-a716-446655440000':
    '[pre-existing] real content id reused across dialogue suites',
  '550e8400-e29b-41d4-a716-446655440002':
    '[pre-existing] shared entity fixture (api-contract, move)',
  'e5f6a7b8-c9d0-1234-efab-345678901234':
    '[pre-existing] real content scene id reused as a fixture (move, sleep)',
  'c0000000-0000-4000-8000-000000000001':
    '[pre-existing] shared dialogue fixture (unit snapshot, m30.snapshots)',
  'e0000000-e29b-41d4-a716-446655440099':
    '[pre-existing] shared entity fixture (job-runs.resume, migration.drift)',

  // [pre-existing] Generic synthetic ids that predate the prefix-block rule.
  '00000000-0000-0000-0000-000000000000':
    '[pre-existing] generic synthetic id (content-resolver, gigs, intake validation)',
  '00000000-0000-0000-0000-000000000002':
    '[pre-existing] generic synthetic id (5 suites)',
  '00000000-0000-0000-0000-000000000010':
    '[pre-existing] generic synthetic id (AssetPublishService, migration, move)',
  '00000000-0000-4000-8000-000000000001':
    '[pre-existing] generic synthetic id (dialogueNodeVisual, storyBuilderMigration.audit)',
  '00000000-0000-0000-0000-000000000020':
    '[pre-existing] shared user row (database-constraints, sleep)',
  '00000000-0000-0000-0000-000000000077':
    '[pre-existing] shared user row, deleted by both gigs and shop in afterAll',
  '00000000-0000-0000-0000-000000000099':
    '[pre-existing] shared user row, deleted by 4 suites in afterAll',
  '11111111-1111-1111-1111-111111111111':
    '[pre-existing] generic synthetic id',
  '11111111-2222-3333-4444-555555555555':
    '[pre-existing] shared user row (story-builder-plans, story-builder-stage-migrate)',
  '11111111-1111-4111-8111-111111111111':
    '[pre-existing] generic synthetic id (6 suites)',
  '22222222-2222-2222-2222-222222222222':
    '[pre-existing] generic synthetic id',
  '22222222-2222-4222-8222-222222222222':
    '[pre-existing] generic synthetic id (outline-chunking, paypal-webhook)',
  '33333333-3333-3333-3333-333333333333':
    '[pre-existing] generic synthetic id',
  '33333333-3333-4333-8333-333333333333':
    '[pre-existing] generic synthetic id (outline-chunking, paypal-webhook)',
  '55555555-6666-4777-8888-999999990001':
    '[pre-existing] shared entity fixture (api-contract, mvw)',
  'e4800000-0000-4000-8000-000000048002':
    '[pre-existing] shared user row, deleted by both suites in afterAll',
  'a0000000-e000-4000-8000-000000000000':
    '[pre-existing] generic synthetic id',
  'a0000000-e000-4000-8000-000000000001':
    '[pre-existing] generic synthetic id',
  'a0000000-e000-4000-8000-00000000000a':
    '[pre-existing] generic synthetic id',
  'a0000000-e000-4000-8000-0000000000aa':
    '[pre-existing] generic synthetic id',
  'b0000000-e000-4000-8000-000000000001':
    '[pre-existing] generic synthetic id',
  'c9600000-e000-4000-8000-0000000000c0':
    '[pre-existing] generic synthetic id',
  'e1000000-e29b-41d4-a716-446655440001':
    '[pre-existing] generic synthetic id',
  '670eea6f-3983-4d5a-8195-b08be6c81661':
    '[pre-existing] generic synthetic id',
  '880e8400-e29b-41d4-a716-446655440001':
    '[pre-existing] generic synthetic id',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d':
    '[pre-existing] generic synthetic id',
  '99999999-9999-9999-9999-999999999999':
    '[pre-existing] generic synthetic id',
};

function collectSharedLiterals(): Array<{ uuid: string; files: string[] }> {
  const byUuid = new Map<string, Set<string>>();

  for (const file of fs.readdirSync(INTEGRATION_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const source = fs.readFileSync(path.join(INTEGRATION_DIR, file), 'utf-8');
    for (const match of source.match(UUID_PATTERN) ?? []) {
      const uuid = match.toLowerCase();
      const bucket = byUuid.get(uuid);
      if (bucket) bucket.add(file);
      else byUuid.set(uuid, new Set([file]));
    }
  }

  return [...byUuid.entries()]
    .filter(([uuid, files]) => files.size > 1 && !(uuid in ALLOWLIST))
    .map(([uuid, files]) => ({ uuid, files: [...files].sort() }));
}

describe('integration fixture isolation', () => {
  test('no UUID literal is used by more than one integration suite', () => {
    const shared = collectSharedLiterals();
    if (shared.length > 0) {
      const report = shared
        .map(({ uuid, files }) => `  ${uuid}\n    ${files.join('\n    ')}`)
        .join('\n');
      throw new Error(
        `UUID literals shared by 2+ integration suites cause row-level cross-test ` +
          `interference when a suite's afterAll deletes a row a sibling worker is ` +
          `still using. Give one side its own prefix block (e.g. d2000000-*) and a ` +
          `collision-avoidance comment instead of sharing. Offenders:\n${report}`,
      );
    }
    expect(shared).toEqual([]);
  });

  test('every allowlisted UUID carries a justification', () => {
    const unexplained = Object.entries(ALLOWLIST)
      .filter(([, reason]) => !reason || reason.trim().length === 0)
      .map(([uuid]) => uuid);
    if (unexplained.length > 0) {
      throw new Error(
        'Every ALLOWLIST entry must state why the literal cannot be re-pointed ' +
          `at a suite-private value. Missing a reason:\n  ${unexplained.join('\n  ')}`,
      );
    }
    expect(unexplained).toEqual([]);
  });
});
