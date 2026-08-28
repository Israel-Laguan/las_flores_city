import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  parseArgs,
  resolveActor,
  reviewUrl,
  usage,
  DEFAULT_DEV_ADMIN_ID,
} from '../../src/planIntakeCore.js';
import type { QueryOLTP } from '../../src/planIntakeCore.js';

type Row = { id: string; email: string; role: string };

function makeQuery(rows: Row[]): jest.MockedFunction<QueryOLTP> {
  return jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows })) as unknown as jest.MockedFunction<QueryOLTP>;
}

describe('plan:intake CLI argument parsing', () => {
  const ORIGINAL_ARGV = process.argv;
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
    process.env = { ...ORIGINAL_ENV };
  });

  it('parses a positional intake path', () => {
    const opts = parseArgs(['node', 'run_plan_intake.ts', 'intake.md']);
    expect(opts.inputPath).toBe('intake.md');
    expect(opts.userId).toBeUndefined();
    expect(opts.userEmail).toBeUndefined();
  });

  it('parses --user-email and --admin-url', () => {
    const opts = parseArgs([
      'node', 'run_plan_intake.ts', 'intake.md',
      '--user-email', 'admin@example.com',
      '--admin-url', 'http://localhost:3002',
    ]);
    expect(opts.userEmail).toBe('admin@example.com');
    expect(opts.adminUrl).toBe('http://localhost:3002');
  });

  it('parses --user-id', () => {
    const opts = parseArgs([
      'node', 'run_plan_intake.ts', 'intake.md',
      '--user-id', '11111111-1111-1111-1111-111111111111',
    ]);
    expect(opts.userId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('throws when no intake path is given', () => {
    expect(() => parseArgs(['node', 'run_plan_intake.ts'])).toThrow(/intake Markdown path is required/);
  });

  it('throws on unknown options', () => {
    expect(() => parseArgs(['node', 'run_plan_intake.ts', 'intake.md', '--bogus']))
      .toThrow(/Unknown option/);
  });

  it('throws on duplicate positional input', () => {
    expect(() => parseArgs(['node', 'run_plan_intake.ts', 'a.md', 'b.md']))
      .toThrow(/Unexpected argument/);
  });

  it('throws when both --user-id and --user-email are given', () => {
    expect(() => parseArgs([
      'node', 'run_plan_intake.ts', 'intake.md',
      '--user-id', 'x', '--user-email', 'y',
    ])).toThrow(/not both/);
  });
});

describe('plan:intake actor resolution', () => {
  const DEV_ADMIN_ID = DEFAULT_DEV_ADMIN_ID;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = process.env;
    delete env.PLAN_ACTOR_USER_ID;
    delete env.ADMIN_USER_ID;
    delete env.NODE_ENV;
  });

  it('resolves actor by email', async () => {
    const query = makeQuery([{ id: 'u-a', email: 'admin@example.com', role: 'admin' }]);
    const actor = await resolveActor(query, { inputPath: 'x.md', userEmail: 'admin@example.com' });
    expect(actor.id).toBe('u-a');
    expect(actor.role).toBe('admin');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('email = $1'),
      ['admin@example.com'],
    );
  });

  it('resolves the default dev admin id when nothing else is configured', async () => {
    const query = makeQuery([{ id: DEV_ADMIN_ID, email: 'dev@example.com', role: 'developer' }]);
    const actor = await resolveActor(query, { inputPath: 'x.md' });
    expect(actor.id).toBe(DEV_ADMIN_ID);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('id = $1'),
      [DEV_ADMIN_ID],
    );
  });

  it('prefers PLAN_ACTOR_USER_ID over the default dev admin', async () => {
    env.PLAN_ACTOR_USER_ID = 'cafebabe-0000-0000-0000-000000000000';
    const query = makeQuery([{ id: 'cafebabe-0000-0000-0000-000000000000', email: 'p@example.com', role: 'admin' }]);
    const actor = await resolveActor(query, { inputPath: 'x.md' });
    expect(actor.id).toBe('cafebabe-0000-0000-0000-000000000000');
  });

  it('throws when --user-email matches no user', async () => {
    const query = makeQuery([]);
    await expect(resolveActor(query, { inputPath: 'x.md', userEmail: 'ghost@example.com' }))
      .rejects.toThrow(/No user found for --user-email ghost@example.com/);
  });

  it('throws when no actor can be resolved', async () => {
    const query = makeQuery([]);
    delete env.NODE_ENV;
    delete env.PLAN_ACTOR_USER_ID;
    delete env.ADMIN_USER_ID;
    env.NODE_ENV = 'production';
    await expect(resolveActor(query, { inputPath: 'x.md' }))
      .rejects.toThrow(/No plan actor configured/);
  });

  it('rejects a non-admin/non-developer actor', async () => {
    const query = makeQuery([{ id: 'u-player', email: 'player@example.com', role: 'player' }]);
    await expect(resolveActor(query, { inputPath: 'x.md', userEmail: 'player@example.com' }))
      .rejects.toThrow(/admin or developer is required/);
  });
});

describe('plan:intake review URL', () => {
  it('builds a well-formed review URL with the planId', () => {
    const url = reviewUrl('http://localhost:3002/', 'plan-123');
    expect(url).toBe('http://localhost:3002/story-builder?planId=plan-123');
  });

  it('does not double a trailing slash', () => {
    const url = reviewUrl('http://localhost:3002', 'plan-abc');
    expect(url).toBe('http://localhost:3002/story-builder?planId=plan-abc');
  });

  it('encodes the planId', () => {
    const url = reviewUrl('http://localhost:3002', 'a b/c');
    expect(url).toBe('http://localhost:3002/story-builder?planId=a%20b%2Fc');
  });
});

describe('plan:intake usage', () => {
  it('documents the intake path and options', () => {
    const text = usage();
    expect(text).toContain('--user-id');
    expect(text).toContain('--user-email');
    expect(text).toContain('--admin-url');
  });
});
