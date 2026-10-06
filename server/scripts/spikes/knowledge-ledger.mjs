#!/usr/bin/env node
// SC-S8: knowledge-ledger shape. Three parts, all re-runnable from repo root:
//   1. Inventory of candidate secrets/facts already encoded in content/ (flags, vault clues).
//   2. Hand-labelled fixture (knowledge-ledger-fixture.json): explicit-registry projection + a
//      deterministic keyword baseline for "inferred exposure" (precision/recall, pair level).
//   3. `--llm`: cheap-model (LLM_MODEL) inference over the same fixture. Prints
//      "not run — endpoint unavailable" and exits 0 if no authenticated endpoint answers.
// Usage: node server/scripts/spikes/knowledge-ledger.mjs [--llm]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { callCheapModel, endpointAvailable, MODEL } from './llm-probe.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const yaml = createRequire(import.meta.url)('js-yaml');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// ---------- 1. inventory ----------
const flags = new Map(); // name -> {set, read, files:Set}
const state = new Map();
function note(map, k, role, f) { const e = map.get(k) ?? { set: 0, read: 0, files: new Set() }; e[role]++; e.files.add(path.basename(f)); map.set(k, e); }
let nodes = 0;
function visit(o, f) {
  if (Array.isArray(o)) return o.forEach((x) => visit(x, f));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'flag_set' && v) Object.keys(v).forEach((x) => note(flags, x, 'set', f));
    if (['required_flags', 'hidden_if'].includes(k) && v) Object.keys(v).forEach((x) => note(flags, x, 'read', f));
    if (k === 'state_set' && v) Object.keys(v).forEach((x) => note(state, x, 'set', f));
    if (k === 'nodes' && v && typeof v === 'object' && !Array.isArray(v)) nodes += Object.keys(v).length;
    visit(v, f);
  }
}
for (const f of walk(path.join(root, 'content')).filter((f) => /\.ya?ml$/.test(f))) {
  try { visit(yaml.load(fs.readFileSync(f, 'utf8')), f); } catch { /* non-content yaml */ }
}
const cls = (n) =>
  /(_revealed|_known|_shared|_knowledge|_discussed|_has_|_mentioned|_acknowledged|_explained|_briefed)/i.test(n) ? 'fact-like'
  : /(_complete|_done|_seen|_made|_reached|_received|_answered|_declined|_visited|_active|_incomplete)$/i.test(n) ? 'progress'
  : /(ending|_path|romanced|rejected|sold_out|betrayed|success|forged|offered)/i.test(n) ? 'choice-outcome'
  : 'other';
const byCls = {};
for (const [n, e] of flags) { (byCls[cls(n)] ??= []).push([n, e]); }
console.log('== SC-S8 inventory ==');
console.log(`nodes (all dialogue/overlay yaml): ${nodes}`);
console.log(`distinct flags set/read: ${flags.size}; flags read by ZERO gates: ${[...flags.values()].filter((e) => e.read === 0).length}`);
for (const [c, l] of Object.entries(byCls)) console.log(`  ${c.padEnd(15)} ${String(l.length).padStart(3)} flags (${l.filter(([, e]) => e.read === 0).length} never read)`);
console.log('  fact-like flags:', (byCls['fact-like'] ?? []).map(([n]) => n).join(', '));
console.log(`distinct state keys: ${state.size} (${[...state.keys()].filter((k) => k.startsWith('last_') && k.endsWith('_encounter_at')).length} are last_*_encounter_at timestamps)`);
const vaultClues = yaml.load(fs.readFileSync(path.join(root, 'content/vault/great_lithium_leak_clues.yaml'), 'utf8')).vault_items;
console.log(`vault clues (great_lithium_leak): ${vaultClues.length}; unlocked by a dialogue choice in content: 1 (overlay_great_lithium_leak.yaml) -> the other ${vaultClues.length - 1} have no content-side unlock path`);
console.log('NOTE: flags live in the PLAYER state bag (player_dialogue_states/flags); none carries a character subject, so none can mean "NPC X knows F".');

// ---------- 2. fixture ----------
const fx = JSON.parse(fs.readFileSync(path.join(here, 'knowledge-ledger-fixture.json'), 'utf8'));
const key = ([c, f]) => `${c}|${f}`;
const gold = new Set(fx.excerpts.flatMap((e) => e.expected.map(key)));
const score = (pred, label) => {
  const p = new Set(pred); let tp = 0; for (const k of p) if (gold.has(k)) tp++;
  const prec = p.size ? tp / p.size : 1; const rec = gold.size ? tp / gold.size : 1;
  console.log(`${label}: predicted=${p.size} gold=${gold.size} TP=${tp} FP=${p.size - tp} FN=${gold.size - tp} precision=${(prec * 100).toFixed(0)}% recall=${(rec * 100).toFixed(0)}%`);
};
console.log(`\n== fixture: ${fx.excerpts.length} excerpts (${fx.excerpts.filter((e) => e.kind === 'real').length} real, ${fx.excerpts.filter((e) => e.kind === 'synthetic').length} synthetic), ${gold.size} gold (character,fact) pairs, ${Object.keys(fx.facts).length} registered facts ==`);

// 2a explicit registry: author writes fact_refs on the exposing node; audience defaults to scene cast.
// Pair-level result is by construction == gold; the measurable cost is authoring annotations.
const exposing = fx.excerpts.filter((e) => e.expected.length);
const refs = exposing.length; // one fact_refs[] annotation per exposing node/scene/vault item
console.log(`explicit registry: ${refs} authored fact_refs annotations cover all ${gold.size} pairs (exposing excerpts: ${exposing.length}/${fx.excerpts.length}); thought-only/negative excerpts need 0 annotations`);
const absent = fx.excerpts.filter((e) => e.expected.length && !e.present.includes('player') && !e.expected.some(([c]) => c === 'player'));
console.log(`  player-absent exposures handled by default audience=scene cast: ${absent.map((e) => e.id).join(', ')}`);

// 2b deterministic keyword baseline (lower-bound stand-in for naive "inferred"): every present
// character learns every registered fact whose alias occurs in text OR thought.
const base = [];
for (const e of fx.excerpts) {
  const hay = `${e.text} ${e.thought ?? ''}`.toLowerCase();
  for (const [fid, f] of Object.entries(fx.facts)) if (f.aliases.some((a) => hay.includes(a))) for (const c of e.present) base.push(key([c, fid]));
}
score(base, 'keyword baseline (text+thought, aliases hand-tuned on this fixture -> optimistic)');
const base2 = [];
for (const e of fx.excerpts) {
  const hay = e.text.toLowerCase();
  for (const [fid, f] of Object.entries(fx.facts)) if (f.aliases.some((a) => hay.includes(a))) for (const c of e.present) base2.push(key([c, fid]));
}
score(base2, 'keyword baseline (spoken text only)');
const falseOnNeg = fx.excerpts.filter((e) => !e.expected.length).map((e) => {
  const hay = `${e.text} ${e.thought ?? ''}`.toLowerCase();
  return `${e.id}:${Object.entries(fx.facts).filter(([, f]) => f.aliases.some((a) => hay.includes(a))).map(([k]) => k).join('+') || 'none'}`;
});
console.log('negative excerpts (gold = no exposure) hit by keyword baseline:', falseOnNeg.join(' '));

// ---------- 3. cheap model ----------
if (process.argv.includes('--llm')) {
  const avail = await endpointAvailable();
  if (!avail.ok) {
    console.log(`\ncheap-model (${MODEL}) inference: not run — endpoint unavailable (${avail.reason})`);
    process.exit(0);
  }
  const sys = `You maintain a knowledge ledger. Given a scene excerpt, the characters present, and a fact registry, return JSON only: {"learned":[{"character":"<id>","fact_id":"<id>","via":"witnessed|told|inferred"}]}. Only characters listed as present can learn. The "thought" field is private inner voice and NEVER exposes anything. Only use fact_ids from the registry. Return {"learned":[]} if nothing is exposed.`;
  const pred = []; let malformed = 0; let tokens = 0;
  for (const e of fx.excerpts) {
    const r = await callCheapModel(sys, JSON.stringify({ present: e.present, text: e.text, thought: e.thought, registry: Object.fromEntries(Object.entries(fx.facts).map(([k, v]) => [k, v.aliases.join(', ')])) }));
    if (!r.ok) { console.log(`cheap-model run aborted: ${r.reason}`); process.exit(0); }
    tokens += r.usage?.total_tokens ?? 0;
    try { const j = JSON.parse(r.text.replace(/^```json\s*|```$/g, '').trim()); for (const l of j.learned ?? []) pred.push(key([l.character, l.fact_id])); } catch { malformed++; }
  }
  score(pred, `cheap model ${MODEL}`);
  console.log(`malformed responses: ${malformed}/${fx.excerpts.length}; total tokens: ${tokens}`);
} else {
  console.log('\ncheap-model inference: skipped (pass --llm). ');
}
