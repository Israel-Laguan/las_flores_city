/* eslint-disable max-lines-per-function */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  parseArgs,
  parseAmendArgs,
  parsePlanDiffArgs,
  resolveActor,
  reviewUrl,
  usage,
  amendUsage,
  planDiffUsage,
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

describe('plan:amend CLI argument parsing', () => {
  const ORIGINAL_ARGV = process.argv;

  afterEach(() => {
    process.argv = ORIGINAL_ARGV;
  });

  const PLAN_ID = 'c9600000-e000-4000-8000-0000000000c0';
  const ANNOTATION_ID = 'c9600001-e000-4000-8000-0000000000c1';
  const ANNOTATION_ID_2 = 'c9600002-e000-4000-8000-0000000000c2';

  it('parses a planId and a single --annotation pair', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:it means City District`,
    ]);
    expect(opts.planId).toBe(PLAN_ID);
    expect(opts.annotations).toEqual([
      { annotationId: ANNOTATION_ID, comment: 'it means City District' },
    ]);
  });

  it('accepts repeated --annotation flags so several notes are amended in one run', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:first correction`,
      '--annotation', `${ANNOTATION_ID_2}:second correction`,
    ]);
    expect(opts.annotations).toEqual([
      { annotationId: ANNOTATION_ID, comment: 'first correction' },
      { annotationId: ANNOTATION_ID_2, comment: 'second correction' },
    ]);
  });

  it('splits on the FIRST colon so a comment may contain colons', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:it means City District: the northern one`,
    ]);
    expect(opts.annotations[0]).toEqual({
      annotationId: ANNOTATION_ID,
      comment: 'it means City District: the northern one',
    });
  });

  it('trims surrounding whitespace from the id and comment', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:   padded comment   `,
    ]);
    expect(opts.annotations[0].comment).toBe('padded comment');
  });

  it('parses actor and admin-url options alongside annotations', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:fix it`,
      '--user-email', 'admin@example.com',
      '--admin-url', 'http://localhost:4000',
    ]);
    expect(opts.userEmail).toBe('admin@example.com');
    expect(opts.adminUrl).toBe('http://localhost:4000');
  });

  it('throws when the planId is missing', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', '--annotation', `${ANNOTATION_ID}:fix it`,
    ])).toThrow(/A planId is required/);
  });

  it('throws when no --annotation is supplied (nothing to amend)', () => {
    expect(() => parseAmendArgs(['node', 'run_plan_amend.ts', PLAN_ID]))
      .toThrow(/At least one --annotation/);
  });

  it('throws when --annotation has no colon separator', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--annotation', ANNOTATION_ID,
    ])).toThrow(/must be <id>:<comment>/);
  });

  it('throws when --annotation has an empty comment', () => {
    // An empty comment gives the LLM nothing to act on, so reject it before
    // burning a proposal call that cannot succeed.
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--annotation', `${ANNOTATION_ID}:`,
    ])).toThrow(/missing a comment/);
  });

  it('throws when --annotation has an empty id', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--annotation', ':orphan comment',
    ])).toThrow(/must be <id>:<comment>/);
  });

  it('throws when --annotation has no value at all', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--annotation',
    ])).toThrow(/--annotation requires/);
  });

  it('rejects an unknown option', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:fix it`, '--nope',
    ])).toThrow(/Unknown option/);
  });

  it('rejects a duplicate positional argument', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, 'extra',
      '--annotation', `${ANNOTATION_ID}:fix it`,
    ])).toThrow(/Unexpected argument/);
  });

  it('rejects both --user-id and --user-email', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:fix it`,
      '--user-id', 'c9600003-e000-4000-8000-0000000000c3',
      '--user-email', 'admin@example.com',
    ])).toThrow(/not both/);
  });

  it('parses a planId with --instruction (unscoped free-form directive)', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--instruction', 'add a vendor NPC to Mercado Popular',
    ]);
    expect(opts.planId).toBe(PLAN_ID);
    expect(opts.instruction).toBe('add a vendor NPC to Mercado Popular');
    expect(opts.annotations).toEqual([]);
  });

  it('trims surrounding whitespace from --instruction', () => {
    const opts = parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--instruction', '  rewrite Scene X entirely  ',
    ]);
    expect(opts.instruction).toBe('rewrite Scene X entirely');
  });

  it('accepts --instruction as an alternative to --annotation', () => {
    expect(() => parseAmendArgs(['node', 'run_plan_amend.ts', PLAN_ID]))
      .toThrow(/At least one --annotation <id>:<comment> or --instruction/);
  });

  it('throws when --instruction is empty', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--instruction', '   ',
    ])).toThrow(/non-empty string/);
  });

  it('throws when --instruction is missing a value', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID, '--instruction',
    ])).toThrow(/non-empty string/);
  });

  it('rejects combining --instruction with --annotation', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--annotation', `${ANNOTATION_ID}:fix it`,
      '--instruction', 'add a vendor NPC',
    ])).toThrow(/cannot be combined/);
  });

  it('rejects more than one --instruction', () => {
    expect(() => parseAmendArgs([
      'node', 'run_plan_amend.ts', PLAN_ID,
      '--instruction', 'first',
      '--instruction', 'second',
    ])).toThrow(/Only one --instruction/);
  });
});

describe('plan:amend usage', () => {
  it('documents the annotation flag and actor options', () => {
    const text = amendUsage();
    expect(text).toContain('--annotation');
    expect(text).toContain('--instruction');
    expect(text).toContain('--user-id');
    expect(text).toContain('--user-email');
    expect(text).toContain('--admin-url');
  });
});

describe('plan:diff CLI argument parsing', () => {
  it('parses a positional planId', () => {
    const opts = parsePlanDiffArgs(['node', 'run_plan_diff.ts', 'plan-xyz']);
    expect(opts.planId).toBe('plan-xyz');
    expect(opts.adminUrl).toBeUndefined();
  });

  it('parses --admin-url', () => {
    const opts = parsePlanDiffArgs([
      'node', 'run_plan_diff.ts', 'plan-xyz',
      '--admin-url', 'http://localhost:4000',
    ]);
    expect(opts.adminUrl).toBe('http://localhost:4000');
  });

  it('throws when no planId is given', () => {
    expect(() => parsePlanDiffArgs(['node', 'run_plan_diff.ts']))
      .toThrow(/A planId is required/);
  });

  it('throws on an unknown option', () => {
    expect(() => parsePlanDiffArgs(['node', 'run_plan_diff.ts', 'plan-xyz', '--bogus']))
      .toThrow(/Unknown option/);
  });

  it('throws on a duplicate positional argument', () => {
    expect(() => parsePlanDiffArgs(['node', 'run_plan_diff.ts', 'a', 'b']))
      .toThrow(/Unexpected argument/);
  });

  it('documents the admin-url option', () => {
    expect(planDiffUsage()).toContain('--admin-url');
  });
});
