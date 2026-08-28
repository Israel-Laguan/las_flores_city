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

export const DEFAULT_DEV_ADMIN_ID = '00000000-0000-0000-0000-000000000001';

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
  options: CliOptions,
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
