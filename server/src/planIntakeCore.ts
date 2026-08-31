// Pure, testable helpers for the plan:intake CLI. Kept free of top-level
// `import.meta.url` / dotenv side effects so unit tests can import it under
// ts-jest's CommonJS transform. `run_plan_intake.ts` imports these.

export interface CliOptions {
  inputPath: string;
  userId?: string;
  userEmail?: string;
  adminUrl?: string;
}

export interface Actor {
  id: string;
  email: string;
  role: string;
}

export type QueryOLTP = typeof import('@las-flores/infra')['queryOLTP'];

export const DEFAULT_DEV_ADMIN_ID = 'f0000000-0000-4000-8000-00000000a001';

export function usage(): string {
  return [
    'Usage: npm run plan:intake --workspace=server -- <intake.md> [options]',
    '',
    'Options:',
    '  --user-id <uuid>       Admin/developer actor (or PLAN_ACTOR_USER_ID)',
    '  --user-email <email>   Resolve admin/developer actor by email',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

export function parseArgs(argv: string[]): CliOptions {
  let inputPath: string | undefined;
  let userId: string | undefined;
  let userEmail: string | undefined;
  let adminUrl: string | undefined;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--user-id') {
      userId = argv[++i];
      continue;
    }
    if (arg === '--user-email') {
      userEmail = argv[++i];
      continue;
    }
    if (arg === '--admin-url') {
      adminUrl = argv[++i];
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
    if (inputPath) throw new Error(`Unexpected argument: ${arg}\n\n${usage()}`);
    inputPath = arg;
  }

  if (!inputPath) throw new Error(`An intake Markdown path is required.\n\n${usage()}`);
  if (userId && userEmail) throw new Error('Use either --user-id or --user-email, not both');
  return { inputPath, userId, userEmail, adminUrl };
}

export async function resolveActor(
  queryOLTP: QueryOLTP,
  // Only the actor fields are read, so both the intake and amend option shapes
  // (which differ in their positional argument) can share this resolver.
  options: Pick<CliOptions, 'userId' | 'userEmail'>,
): Promise<Actor> {
  const configuredId = options.userId
    ?? process.env.PLAN_ACTOR_USER_ID
    ?? process.env.ADMIN_USER_ID
    ?? (process.env.NODE_ENV === 'production' ? undefined : DEFAULT_DEV_ADMIN_ID);

  const result = options.userEmail
    ? await queryOLTP<Actor>(
      'SELECT id, email, role FROM users WHERE email = $1 LIMIT 1',
      [options.userEmail.trim()],
    )
    : configuredId
      ? await queryOLTP<Actor>(
        'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
        [configuredId],
      )
      : { rows: [] };

  const actor = result.rows[0];
  if (!actor) {
    throw new Error(
      options.userEmail
        ? `No user found for --user-email ${options.userEmail}`
        : 'No plan actor configured. Use --user-id, --user-email, or PLAN_ACTOR_USER_ID.',
    );
  }
  if (actor.role !== 'admin' && actor.role !== 'developer') {
    throw new Error(`Plan actor ${actor.email} has role ${actor.role}; admin or developer is required`);
  }
  return actor;
}

export function reviewUrl(adminUrl: string, planId: string): string {
  const base = adminUrl.replace(/\/$/, '');
  return `${base}/story-builder?planId=${encodeURIComponent(planId)}`;
}

// ---------------------------------------------------------------------------
// plan:amend — reply to an intake note on an EXISTING plan.
//
// Intake is fail-open: an ambiguous reference produces a note (a `CritiqueAnnotation`
// scoped 'intake') instead of stopping the plan. Amend is the other half of that
// loop — attach a comment to one note and let the plan incorporate the correction.
// ---------------------------------------------------------------------------

/** One note to reply to: the annotation's id plus the author's correction. */
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

/**
 * Parse the amend CLI. Repeated `--annotation <id>:<comment>` flags keep this a
 * pure CLI tool with no invented file format.
 *
 * The id/comment split is on the FIRST colon only, so a comment may itself contain
 * colons (e.g. `--annotation abc:"it means City District: the northern one"`).
 */
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
      // An empty comment would send the LLM nothing to act on, so reject it here
      // rather than burning a proposal call that cannot succeed.
      if (!comment) throw new Error(`--annotation ${annotationId} is missing a comment\n\n${amendUsage()}`);
      annotations.push({ annotationId, comment });
      continue;
    }
    if (arg === '--instruction') {
      const text = argv[++i];
      if (!text || text.trim().length === 0) {
        throw new Error(`--instruction requires a non-empty string\n\n${amendUsage()}`);
      }
      if (instruction) throw new Error(`Only one --instruction is allowed\n\n${amendUsage()}`);
      instruction = text.trim();
      continue;
    }
    if (arg === '--user-id') {
      userId = argv[++i];
      continue;
    }
    if (arg === '--user-email') {
      userEmail = argv[++i];
      continue;
    }
    if (arg === '--admin-url') {
      adminUrl = argv[++i];
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
