#!/usr/bin/env node
// SC-S10: time-vs-prose. Re-runnable from repo root:
//   node server/scripts/spikes/time-vs-prose.mjs [--llm]
// Part 1 (deterministic): where does time/cost live in content + code, TB cost distribution.
// Part 2: regex baseline for claimed-elapsed-minutes vs the hand labels in time-vs-prose-fixture.json.
// Part 3 (--llm): cheap model (LLM_MODEL) on the same fixture; prints
//   "not run — endpoint unavailable" and exits 0 if no authenticated endpoint answers.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { callCheapModel, endpointAvailable, MODEL } from './llm-probe.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const yaml = createRequire(import.meta.url)('js-yaml');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// ---------- 1. where does time live ----------
const where = {}; const amounts = [];
function visit(o, f, parent) {
  if (Array.isArray(o)) return o.forEach((x) => visit(x, f, parent));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'time_block_cost') {
      const kind = o.next_node_id !== undefined ? 'dialogue choice' : o.id !== undefined && /gig/.test(f) ? 'gig' : `other(${path.basename(f)})`;
      where[kind] = (where[kind] ?? 0) + 1;
      if (typeof v === 'number') amounts.push(v); else if (v?.amount) amounts.push(v.amount);
    }
    visit(v, f, k);
  }
}
const sceneKeys = new Set(); const fileKinds = {};
for (const f of walk(path.join(root, 'content')).filter((f) => /\.ya?ml$/.test(f))) {
  let d; try { d = yaml.load(fs.readFileSync(f, 'utf8')); } catch { continue; }
  visit(d, f);
  if (/content\/scenes\//.test(f) && d && typeof d === 'object') Object.keys(d).forEach((k) => sceneKeys.add(k));
}
console.log('== SC-S10 (1) where time lives ==');
console.log('time_block_cost owners:', JSON.stringify(where), `total=${amounts.length}`);
const hist = amounts.reduce((a, n) => ((a[n] = (a[n] ?? 0) + 1), a), {});
console.log('TB amount histogram (1 TB = 30 in-game min):', JSON.stringify(hist), `mean=${(amounts.reduce((a, b) => a + b, 0) / amounts.length).toFixed(2)} TB`);
console.log('existing scene yaml top-level keys:', [...sceneKeys].sort().join(', '));
console.log('  time/time_block* key on any existing scene:', [...sceneKeys].some((k) => /time/.test(k)));
const timeTs = fs.readFileSync(path.join(root, 'client/src/utils/time.ts'), 'utf8');
console.log('client getTimeOfDay returns:', (timeTs.match(/TimeOfDay =\s*([^;]+);/) || [])[1], '(background tag for dusk is `sunset` per AGENTS.md -> naming drift to settle in SC-301)');
console.log('day length:', (timeTs.match(/full 24h cycle is exactly (\d+) blocks/) || [])[1], 'TB; TB -> 30 min');

// ---------- 2. regex baseline ----------
const fx = JSON.parse(fs.readFileSync(path.join(here, 'time-vs-prose-fixture.json'), 'utf8')).excerpts;
const W = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
const U = { minute: 1, minutes: 1, hour: 60, hours: 60, day: 1440, days: 1440 };
function extract(prose) {
  const m = prose.match(/\b(\d+|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty)\s+(minutes?|hours?|days?)\b(?!\s*(?:\.|,)?\s*(?:ago|from now))/i);
  if (/\b(give me|in|within)\s+\d+\s+days\b/i.test(prose) || /\bweeks?|months?\b/i.test(prose)) return { claimed: null, evidence: 'future/other' };
  if (m) return { claimed: (/^\d+$/.test(m[1]) ? +m[1] : W[m[1].toLowerCase()]) * U[m[2].toLowerCase()], evidence: m[0] };
  if (/\bnext morning\b/i.test(prose)) return { claimed: 720, evidence: 'next morning' };
  return { claimed: null, evidence: '' };
}
function evalSet(label, predict) {
  const gold = fx.filter((e) => e.claimed.type === 'duration');
  let tp = 0, fp = 0, fn = 0, exact = 0, noClaimFP = 0; const noClaim = fx.filter((e) => e.claimed.type !== 'duration');
  const mm = { tp: 0, fp: 0, fn: 0 };
  for (const e of fx) {
    const p = predict(e); const isGold = e.claimed.type === 'duration';
    if (p !== null) { if (isGold) { tp++; if (p / e.claimed.minutes <= 2 && p / e.claimed.minutes >= 0.5) exact++; } else { fp++; noClaimFP++; } }
    else if (isGold) fn++;
    const predMismatch = p !== null && (p > 2 * e.tb_sum * 30 || p < (e.tb_sum * 30) / 2);
    if (predMismatch && e.mismatch_vs_tb) mm.tp++; else if (predMismatch) mm.fp++; else if (e.mismatch_vs_tb) mm.fn++;
  }
  const pr = (a, b) => (a + b ? ((a / (a + b)) * 100).toFixed(0) + '%' : 'n/a');
  console.log(`${label}\n  detection (duration claims): TP=${tp} FP=${fp} FN=${fn} precision=${pr(tp, fp)} recall=${pr(tp, fn)}; minutes within 2x of label: ${exact}/${tp}; false-positive rate on ${noClaim.length} non-duration excerpts: ${((noClaimFP / noClaim.length) * 100).toFixed(0)}%`);
  console.log(`  TB-mismatch flag: TP=${mm.tp} FP=${mm.fp} FN=${mm.fn} precision=${pr(mm.tp, mm.fp)} recall=${pr(mm.tp, mm.fn)} (gold mismatches=${fx.filter((e) => e.mismatch_vs_tb).length})`);
}
console.log(`\n== SC-S10 (2) fixture: ${fx.length} excerpts (${fx.filter((e) => e.kind === 'real').length} real, ${fx.filter((e) => e.kind === 'synthetic').length} synthetic); numeric-duration gold claims: ${fx.filter((e) => e.claimed.type === 'duration').length}; real numeric: ${fx.filter((e) => e.kind === 'real' && e.claimed.type === 'duration').length} ==`);
evalSet('regex baseline (deterministic, no LLM)', (e) => extract(e.prose).claimed);

// ---------- 3. cheap model ----------
if (process.argv.includes('--llm')) {
  const avail = await endpointAvailable();
  if (!avail.ok) { console.log(`\ncheap-model (${MODEL}): not run — endpoint unavailable (${avail.reason})`); process.exit(0); }
  const sys = 'Extract the ELAPSED in-story time the prose claims has passed during/after this beat. Reply JSON only: {"claimed_minutes": number|null, "evidence": string}. Use null for: no claim, vague claims ("a moment"), time-of-day only ("sunset","tonight"), future references, backstory.';
  const preds = new Map(); let malformed = 0; let tokens = 0;
  for (const e of fx) {
    const r = await callCheapModel(sys, e.prose);
    if (!r.ok) { console.log(`cheap-model run aborted: ${r.reason}`); process.exit(0); }
    tokens += r.usage?.total_tokens ?? 0;
    try { const j = JSON.parse(r.text.replace(/^```json\s*|```$/g, '').trim()); preds.set(e.id, typeof j.claimed_minutes === 'number' ? j.claimed_minutes : null); } catch { malformed++; preds.set(e.id, null); }
  }
  evalSet(`cheap model ${MODEL}`, (e) => preds.get(e.id));
  console.log(`malformed: ${malformed}/${fx.length}; total tokens: ${tokens} (cost: apply LLMCostEstimator.estimateCost to tokens)`);
} else console.log('\ncheap-model: skipped (pass --llm)');
