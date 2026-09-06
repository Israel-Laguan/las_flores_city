export interface AmendAnnotation {
  annotationId: string;
  comment: string;
}

export interface AmendCliOptions {
  planId: string;
  annotations: AmendAnnotation[];
  instruction?: string;
  userId?: string;
  userEmail?: string;
  adminUrl?: string;
}

export function amendUsage(): string {
  return [
    'Usage: npm run plan:amend --workspace=server -- <planId> (--annotation <id>:"<comment>" | --instruction "<text>") [options]',
    '',
    'Options:',
    '  --annotation <id>:<comment>  Reply to one intake note (repeatable)',
    '  --instruction <text>         Free-form directive against the whole plan (unscoped)',
    '  --user-id <uuid>             Admin/developer actor (or PLAN_ACTOR_USER_ID)',
    '  --user-email <email>         Resolve admin/developer actor by email',
    '  --admin-url <url>            Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseAmendArgs(argv: string[]): AmendCliOptions {
  let planId: string | undefined;
  let userId: string | undefined;
  let userEmail: string | undefined;
  let adminUrl: string | undefined;
  let instruction: string | undefined;
  const annotations: AmendAnnotation[] = [];

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(amendUsage());
      process.exit(0);
    }
    if (arg === '--annotation') {
      const raw = argv[++i];
      if (!raw) throw new Error(`--annotation requires <id>:<comment>\n\n${amendUsage()}`);
      const sep = raw.indexOf(':');
      if (sep <= 0) {
        throw new Error(`--annotation must be <id>:<comment> (got "${raw}")\n\n${amendUsage()}`);
      }
      const annotationId = raw.slice(0, sep).trim();
      const comment = raw.slice(sep + 1).trim();
      if (!annotationId) throw new Error(`--annotation is missing an annotation id\n\n${amendUsage()}`);
      if (!comment) throw new Error(`--annotation ${annotationId} is missing a comment\n\n${amendUsage()}`);
      annotations.push({ annotationId, comment });
      continue;
    }
    if (arg === '--instruction') {
      const text = argv[++i];
      if (!text || text.startsWith('--') || text.trim().length === 0) {
        throw new Error(`--instruction requires a non-empty string\n\n${amendUsage()}`);
      }
      if (instruction) throw new Error(`Only one --instruction is allowed\n\n${amendUsage()}`);
      instruction = text.trim();
      continue;
    }
    if (arg === '--user-id') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--user-id requires a value\n\n${amendUsage()}`);
      }
      userId = value;
      continue;
    }
    if (arg === '--user-email') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--user-email requires a value\n\n${amendUsage()}`);
      }
      userEmail = value;
      continue;
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${amendUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${amendUsage()}`);
    }
    if (planId) throw new Error(`Unexpected argument: ${arg}\n\n${amendUsage()}`);
    planId = arg;
  }

  if (!planId) throw new Error(`A planId is required.\n\n${amendUsage()}`);
  if (annotations.length === 0 && !instruction) {
    throw new Error(`At least one --annotation <id>:<comment> or --instruction "<text>" is required.\n\n${amendUsage()}`);
  }
  if (annotations.length > 0 && instruction) {
    throw new Error(`--instruction cannot be combined with --annotation.\n\n${amendUsage()}`);
  }
  if (userId && userEmail) throw new Error('Use either --user-id or --user-email, not both');
  return { planId, annotations, instruction, userId, userEmail, adminUrl };
}

export interface PlanDiffCliOptions {
  planId: string;
  adminUrl?: string;
}

export function planDiffUsage(): string {
  return [
    'Usage: npm run plan:diff --workspace=server -- <planId> [options]',
    '',
    'Options:',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parsePlanDiffArgs(argv: string[]): PlanDiffCliOptions {
  let planId: string | undefined;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(planDiffUsage());
      process.exit(0);
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${planDiffUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${planDiffUsage()}`);
    }
    if (planId) throw new Error(`Unexpected argument: ${arg}\n\n${planDiffUsage()}`);
    planId = arg;
  }

  if (!planId) throw new Error(`A planId is required.\n\n${planDiffUsage()}`);
  return { planId, adminUrl };
}

export interface RejectCliOptions {
  planId: string;
  adminUrl?: string;
}

export function rejectUsage(): string {
  return [
    'Usage: npm run plan:reject --workspace=server -- <planId> [options]',
    '',
    'Softly rejects a plan: sets status to `rejected` (row preserved for audit),',
    'prunes the plan\'s planId-scoped ContentDelta nodes/edges from Neo4j, and',
    'marks open intake annotations addressed. Canonical content is untouched.',
    '',
    'Options:',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseRejectArgs(argv: string[]): RejectCliOptions {
  let planId: string | undefined;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(rejectUsage());
      process.exit(0);
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${rejectUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${rejectUsage()}`);
    }
    if (planId) throw new Error(`Unexpected argument: ${arg}\n\n${rejectUsage()}`);
    planId = arg;
  }

  if (!planId) throw new Error(`A planId is required.\n\n${rejectUsage()}`);
  return { planId, adminUrl };
}

export interface DeleteCliOptions {
  planId: string;
  yes: boolean;
  adminUrl?: string;
}

export function deleteUsage(): string {
  return [
    'Usage: npm run plan:delete --workspace=server -- <planId> --yes [options]',
    '',
    'Hard-delete a plan: removes the content_plans row, its planId-scoped',
    'ContentDelta nodes/edges from Neo4j, and its scope=intake annotations.',
    'Destructive and irreversible — requires --yes. Refuses approved/staged/',
    'migrated/verified/solidified plans; only proposed/rejected are deletable.',
    '',
    'Options:',
    '  --yes                  REQUIRED confirmation guard',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseDeleteArgs(argv: string[]): DeleteCliOptions {
  let planId: string | undefined;
  let yes = false;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(deleteUsage());
      process.exit(0);
    }
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${deleteUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${deleteUsage()}`);
    }
    if (planId) throw new Error(`Unexpected argument: ${arg}\n\n${deleteUsage()}`);
    planId = arg;
  }

  if (!planId) throw new Error(`A planId is required.\n\n${deleteUsage()}`);
  if (!yes) {
    throw new Error(
      `This operation is destructive and irreversible. Re-run with --yes to confirm.\n\n${deleteUsage()}`,
    );
  }
  return { planId, yes, adminUrl };
}

export interface GetCliOptions {
  planId: string;
  adminUrl?: string;
}

export function getUsage(): string {
  return [
    'Usage: npm run plan:get --workspace=server -- <planId> [options]',
    '',
    'Print the full current state of a plan (seeks it fresh from the DB — not',
    'limited to the one just created in this command invocation).',
    '',
    'Options:',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseGetArgs(argv: string[]): GetCliOptions {
  let planId: string | undefined;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(getUsage());
      process.exit(0);
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${getUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${getUsage()}`);
    }
    if (planId) throw new Error(`Unexpected argument: ${arg}\n\n${getUsage()}`);
    planId = arg;
  }

  if (!planId) throw new Error(`A planId is required.\n\n${getUsage()}`);
  return { planId, adminUrl };
}

export interface ListCliOptions {
  status?: string;
  createdByEmail?: string;
  since?: string;
  adminUrl?: string;
}

export function listUsage(): string {
  return [
    'Usage: npm run plan:list --workspace=server -- [options]',
    '',
    'Enumerate plans (id, status, created_by, created_at, deltaCount).',
    '',
    'Options:',
    '  --status <status>      Filter by status (e.g. proposed, rejected)',
    '  --created-by <email>   Filter by plan creator email',
    '  --since <iso-date>     ISO date/timestamp lower-bound on created_at',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseListArgs(argv: string[]): ListCliOptions {
  let status: string | undefined;
  let createdByEmail: string | undefined;
  let since: string | undefined;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(listUsage());
      process.exit(0);
    }
    if (arg === '--status') {
      status = argv[++i];
      if (!status || status.startsWith('--')) throw new Error(`--status requires a value\n\n${listUsage()}`);
      continue;
    }
    if (arg === '--created-by') {
      const email = argv[++i];
      if (!email || email.startsWith('--')) throw new Error(`--created-by requires a value\n\n${listUsage()}`);
      createdByEmail = email;
      continue;
    }
    if (arg === '--since') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`--since requires a value\n\n${listUsage()}`);
      since = value;
      continue;
    }
    if (arg === '--admin-url') {
      const url = argv[++i];
      if (!url || url.startsWith('--')) {
        throw new Error(`--admin-url requires a value\n\n${listUsage()}`);
      }
      adminUrl = url;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${listUsage()}`);
    }
    throw new Error(`Unexpected argument: ${arg}\n\n${listUsage()}`);
  }

  return { status, createdByEmail, since, adminUrl };
}
