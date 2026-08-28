// CLI-first plan intake. This intentionally stops at `proposed`: it creates a
// reviewable AI plan and graph deltas, but never stages, migrates, or solidifies.
// The future admin endpoint should preserve this same boundary.
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_DEV_ADMIN_ID = '00000000-0000-0000-0000-000000000001';

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

interface CliOptions {
  inputPath: string;
  userId?: string;
  userEmail?: string;
  adminUrl?: string;
}

interface Actor {
  id: string;
  email: string;
  role: string;
}

type QueryOLTP = typeof import('@las-flores/infra')['queryOLTP'];

function usage(): string {
  return [
    'Usage: npm run plan:intake --workspace=server -- <intake.md> [options]',
    '',
    'Options:',
    '  --user-id <uuid>       Admin/developer actor (or PLAN_ACTOR_USER_ID)',
    '  --user-email <email>   Resolve admin/developer actor by email',
    '  --admin-url <url>      Review UI base URL (default http://localhost:3002)',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
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

async function resolveActor(
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

function reviewUrl(adminUrl: string, planId: string): string {
  const base = adminUrl.replace(/\/$/, '');
  return `${base}/story-builder?planId=${encodeURIComponent(planId)}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const inputPath = path.resolve(process.cwd(), options.inputPath);
  const description = (await fs.readFile(inputPath, 'utf8')).trim();
  if (!description) throw new Error(`Intake Markdown is empty: ${inputPath}`);

  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const actor = await resolveActor(infra.queryOLTP, options);
    const result = await graphIntakeService.createPlanFromDescription(
      description,
      [],
      actor.id,
    );
    const row = await infra.queryOLTP<{
      id: string;
      status: string;
      created_by: string | null;
      updated_at: string;
    }>(
      `SELECT id, status, created_by, updated_at
       FROM content_plans WHERE id = $1`,
      [result.planId],
    );
    const plan = row.rows[0];
    if (!plan || plan.status !== 'proposed' || plan.created_by !== actor.id) {
      throw new Error(`Plan ${result.planId} failed review-ready persistence checks`);
    }
    const graph = await graphIntakeService.getPlanDeltas(result.planId);

    console.log(JSON.stringify({
      planId: result.planId,
      status: plan.status,
      actor: { id: actor.id, email: actor.email, role: actor.role },
      source: inputPath,
      descriptionLength: description.length,
      deltaCount: graph.deltas.length,
      edgeCount: graph.edges.length,
      updatedAt: plan.updated_at,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        result.planId,
      ),
      next: 'Review the plan before invoking approval/solidify; no content files or canonical rows were changed.',
    }, null, 2));
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:intake] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
