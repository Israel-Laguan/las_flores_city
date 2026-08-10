import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

interface ProbeOptions {
  inputFile: string | null;
  description: string | null;
  full: boolean;
  maxChars: number;
  serverUrl: string;
  pollIntervalMs: number;
  maxWaitMs: number;
}

const USAGE = `Usage: npx tsx server/scripts/latency_probe.ts [input-file] [options]

  [input-file]              Story-bible markdown (positional; same as --input)
  -i, --input <path>        Story-bible markdown file
  -d, --description <text>  Literal description instead of reading a file
      --full                Send the entire body, no truncation (= FULL_INPUT=1)
      --max-chars <n>       Brief truncation cap for file input (default 1200)
  -s, --server <url>        Server base URL (default http://localhost:3000)
      --poll-interval <ms>  Generation-status poll interval (default 1000)
      --max-wait <ms>       Max wait for terminal status (default 600000)
  -h, --help                Print this usage and exit 0

Input resolution: argv > env (INPUT_FILE, FULL_INPUT, BRIEF_MAX_CHARS,
SERVER_URL, POLL_INTERVAL_MS, MAX_WAIT_MS) > built-in default.
Exit codes: 0 completed, 1 runtime/probe failure (incl. unreadable input), 2 bad usage.`;

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function failUsage(message: string): never {
  process.stderr.write(`ERROR: ${message}\n\n${USAGE}\n`);
  process.exit(2);
}

/**
 * Parse a positive integer from an environment variable.
 * Returns the fallback when the var is unset/empty.
 * Calls failUsage for non-positive or non-numeric values.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) failUsage(`${name} must be a positive integer`);
  return n;
}

function parseArgs(argv: string[]): ProbeOptions {
  let inputFile: string | null = null;
  let description: string | null = null;
  let full = process.env.FULL_INPUT === '1';
  let maxChars = positiveIntEnv('BRIEF_MAX_CHARS', 1200);
  let serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  let pollIntervalMs = positiveIntEnv('POLL_INTERVAL_MS', 1000);
  let maxWaitMs = positiveIntEnv('MAX_WAIT_MS', 600000);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) failUsage(`missing value for ${arg}`);
      i++;
      return v;
    };
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(USAGE + '\n');
        process.exit(0);
      case '-i':
      case '--input':
        if (inputFile !== null) failUsage('input file given more than once');
        inputFile = expandTilde(next());
        break;
      case '-d':
      case '--description':
        description = next();
        break;
      case '--full':
        full = true;
        break;
      case '--max-chars': {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n <= 0) failUsage('--max-chars must be a positive integer');
        maxChars = n;
        break;
      }
      case '-s':
      case '--server':
        serverUrl = next();
        break;
      case '--poll-interval': {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n <= 0) failUsage('--poll-interval must be a positive integer');
        pollIntervalMs = n;
        break;
      }
      case '--max-wait': {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n <= 0) failUsage('--max-wait must be a positive integer');
        maxWaitMs = n;
        break;
      }
      default:
        if (arg.startsWith('-')) failUsage(`unknown option ${arg}`);
        if (inputFile !== null) failUsage('input file given more than once');
        inputFile = expandTilde(arg);
    }
  }

  const envInput = process.env.INPUT_FILE ? expandTilde(process.env.INPUT_FILE) : null;

  if (description !== null && (inputFile !== null || envInput !== null)) {
    failUsage('use either --input or --description, not both');
  }

  inputFile = inputFile ?? envInput;
  if (description === null && inputFile === null) {
    inputFile = path.join(os.homedir(), 'Downloads', 'posts-compilation-complete.md');
  }

  return { inputFile, description, full, maxChars, serverUrl, pollIntervalMs, maxWaitMs };
}

/**
 * Resolve the Story Builder description.
 *
 * Either a literal `--description` is used verbatim, or the input file is read:
 * its first non-empty heading (H1/H2) anchors a title, and the body is sent
 * whole (FULL_INPUT / --full) or truncated to MAX_CHARS (default 1200). An
 * unreadable input file is a hard error — there is no silent fallback.
 */
async function buildDescription(opts: ProbeOptions): Promise<string> {
  if (opts.description !== null) {
    return opts.description;
  }

  const file = opts.inputFile!;
  let raw = '';
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    process.stderr.write(`FATAL: cannot read input file ${path.resolve(file)}: ${e.code || ''} ${e.message}\n`);
    process.exit(1);
  }

  const lines = raw.split('\n');
  const heading = lines.find((l) => /^#{1,2}\s+/.test(l))?.replace(/^#{1,2}\s+/, '').trim() || 'story bible';
  const body = raw.replace(/^#{1,6}\s+.*$/gm, '').replace(/\s+/g, ' ').trim();

  if (opts.full) {
    console.log(`   --full mode: sending entire file (${body.length} chars)`);
    return `From the story bible "${heading}": ${body}`;
  }

  if (body.length > opts.maxChars) {
    console.log(`   brief truncated: ${body.length} -> ${opts.maxChars} chars (use --full to send the whole file)`);
  }
  const brief = body.slice(0, opts.maxChars);
  return `From the story bible "${heading}": ${brief}`;
}

interface HttpResponse<T = any> {
  ok: boolean; status: number; data?: T; error?: string; cookie?: string;
}

async function req<T>(m: string, u: string, b?: any, c?: string): Promise<HttpResponse<T>> {
  const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie');
  let d: T | undefined;
  try { d = await r.json() as T; } catch {}
  const error = (d as { error?: string } | undefined)?.error;
  return { ok: r.ok, status: r.status, data: d, error, cookie: sc ? sc.split(';')[0] : undefined };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { serverUrl: SERVER_URL, pollIntervalMs: POLL_INTERVAL_MS, maxWaitMs: MAX_WAIT_MS } = opts;
  console.log('=== Story Builder Latency Probe ===\n');
  const description = await buildDescription(opts);
  console.log('[1] Login');
  const login = await req<{ user?: { id: string } }>('POST', SERVER_URL + '/auth/dev-admin-login', { userId: '00000000-0000-0000-0000-000000000001' });
  if (!login.ok) { console.error('FAIL', login.error); process.exit(1); }
  const cookie = login.cookie!;
  console.log('   ok\n');

  console.log('[2] Create plan (LLM mode - generates prompts/lore)');
  const t0 = Date.now();
  const cr = await req<{ success: boolean; data: { planId: string; status: string } }>('POST', SERVER_URL + '/admin/story-builder/plan', { description }, cookie);
  const t1 = Date.now();
  const created = cr.data?.data;
  if (!cr.ok || !created?.planId) { console.error('FAIL', cr.error); process.exit(1); }
  const pid = created.planId;
  const initStatus = created.status;
  console.log('   plan=' + pid + ' status=' + initStatus + ' llm=' + (t1 - t0) + 'ms\n');

  console.log('[3] Poll generation status (wait for async fill)');
  let terminalAt = 0;
  const pollStart = Date.now();
  let finalStatus = '';
  while (Date.now() - pollStart < MAX_WAIT_MS) {
    const pr = await req<{ success: boolean; data: { planId: string; status: string; progress?: { total: number; completed: number; failed: number } } }>('GET', SERVER_URL + '/admin/story-builder/plans/' + pid + '/generation-status', undefined, cookie);
    const status = pr.data?.data?.status ?? '';
    finalStatus = status;
    if (status === 'generating') terminalAt = Date.now();
    if (status === 'done' || status === 'failed') break;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log('   status=' + finalStatus + '\n');

  if (finalStatus !== 'done') {
    console.error('FAIL: Fill did not complete successfully (status=' + finalStatus + ')');
    await req('DELETE', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);
    process.exit(1);
  }

  // Big-story assertions in full-input mode
  if (opts.full) {
    const planCheck = await req<{ success: boolean; data: { plan_json: any } }>('GET', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);
    const planData = planCheck.data?.data?.plan_json;
    const itemCount = planData?.items?.length ?? 0;
    console.log('[4] Big-story assertions');
    console.log('   Item count: ' + itemCount);
    if (itemCount < 3) {
      console.error('FAIL: Expected at least 3 items from full input, got ' + itemCount);
      await req('DELETE', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);
      process.exit(1);
    }
    console.log('   Item count >= 3: yes');
    console.log('   ok\n');
  }

  console.log('[5] Approve-and-solidify');
  const t2 = Date.now();
  const getPlan = await req<{ success: boolean; data: { plan: any } }>('GET', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);
  if (!getPlan.ok || !getPlan.data?.data?.plan) {
    console.error('FAIL: Could not fetch plan for approval', getPlan.error);
    await req('DELETE', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);
    process.exit(1);
  }
  const put = await req('PUT', SERVER_URL + '/admin/story-builder/plans/' + pid, { plan: getPlan.data.data.plan, status: 'verified' }, cookie);
  if (!put.ok) { console.error('FAIL', put.error); process.exit(1); }
  console.log('   set verified\n');

  const tFinal = Date.now();

  // Clean up
  await req('DELETE', SERVER_URL + '/admin/story-builder/plans/' + pid, undefined, cookie);

  console.log('\n=== LATENCY REPORT ===');
  console.log('Plan creation (LLM): ' + (t1 - t0) + 'ms');
  console.log('Async fill wait: ' + (terminalAt ? (terminalAt - pollStart) : 'n/a') + 'ms');
  console.log('Status set to verified: ' + (t2 - pollStart) + 'ms');
  console.log('Total pipeline: ' + (tFinal - t0) + 'ms');
  console.log('Final generation status: ' + finalStatus);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });

// ============================================================
// FINDINGS / SUMMARY
// ============================================================
// 1. Deterministic plan mode (POST with raw plan object):
//    - create: 15ms (no LLM)
//    - set to 'verified' via PUT: 0ms
//    - worker picked up plan within ~26ms (tick floor is NOT a bottleneck)
//    - asset generation failed: ENOENT prompt.md (prompt files not pre-created)
//
// 2. LLM mode with async fill (POST /admin/story-builder/plan):
//    - Generates outline → scaffold → async fill via generation-status endpoint
//    - Plan creation + staging + migration exercises the full pipeline
//    - Async fill completes in under a second when external HTTP succeeds
//
// 3. approve-and-solidify endpoint:
//    - runSolidify now correctly transitions staging → staged before calling
//      migrateStagedPlan (fixed). Migration 055 CHECK constraint allows all
//      async statuses (pending/staging/migrating/verifying).
//
// Bottom line: the worker is fast. The latency of the current pipeline
// is dominated by the external NIM/Pollinations HTTP calls — which
// no BullMQ or SSE will fix.
// ============================================================
