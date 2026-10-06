#!/usr/bin/env node
// SC-S13 spike: when are flag-gated scene overlays applied?
//   (1) variant enumeration at compile  vs  (2) ordered conditional layers at runtime.
// Pure, no DB, no network. Needs api/contracts built (npm run build --workspace=api/contracts).
//
// Fixture: the SC-S3 vq_endings flags (vq_gave_space / vq_pushed_away, from
// content/dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml) used as the
// availability gates of two overlays on one hypothetical base scene.
//
// Usage: node server/scripts/spikes/flag-gated-overlays.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as yaml from 'js-yaml';
import { and, evaluate, extractFlagSlugs, flag, not, TRUE } from '../../../api/contracts/dist/index.js';

// ---------------------------------------------------------------- fixture
const BASE = {
  slug: 'vq_airport_gate',
  weather: 'clear',
  role_slots: [{ slot_id: 'valentina', cast: 'valentina_quan' }, { slot_id: 'bystander', cast: null }],
  dialogue_refs: ['dialogue_vq_endings'],
  items: [],
};

const mkOverlays = (variant) => {
  const A = { slug: 'vq_gave_space_dusk', priority: 10, availability: flag('vq_gave_space', true),
    ops: [{ op: 'add_dialogue_refs', refs: ['dialogue_vq_push_epilogue'] }, { op: 'set_weather', value: 'dusk' }] };
  const B = { slug: 'vq_pushed_away_rain', priority: 10, availability: flag('vq_pushed_away', true),
    ops: [{ op: 'add_items', items: ['crumpled_ticket'] }, { op: 'cast_slot', slot_id: 'bystander', cast: 'security_guard' },
          { op: 'set_weather', value: 'rain' }] };
  // "refined" variant: A is narrowed so it can never co-hold with B.
  if (variant === 'refined') A.availability = and([flag('vq_gave_space', true), not(flag('vq_pushed_away', true))]);
  return [A, B];
};

// ---------------------------------------------------------------- pure composition (prototype of SC-303b)
const sortOverlays = (os) => [...os].sort((a, b) => a.priority - b.priority || (a.slug < b.slug ? -1 : 1));

function compose(base, overlays) {
  const out = { slug: base.slug, weather: base.weather, role_slots: base.role_slots.map((s) => ({ ...s })),
    dialogue_refs: [...base.dialogue_refs], items: [...base.items], provenance: { weather: 'base' }, issues: [] };
  for (const o of sortOverlays(overlays)) {
    for (const op of o.ops) {
      if (op.op === 'add_dialogue_refs') for (const r of op.refs) { if (!out.dialogue_refs.includes(r)) out.dialogue_refs.push(r); }
      if (op.op === 'add_items') for (const i of op.items) if (!out.items.includes(i)) out.items.push(i);
      if (op.op === 'cast_slot') {
        const s = out.role_slots.find((x) => x.slot_id === op.slot_id);
        if (!s) out.issues.push({ code: 'SCENE_SLOT_MISSING', overlay: o.slug });
        else s.cast = op.cast;
      }
      if (op.op === 'set_weather') { out.weather = op.value; out.provenance.weather = o.slug; }
    }
  }
  return out;
}

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);

// ---------------------------------------------------------------- k measurement
function distinctSlugs(overlays) {
  const s = new Set();
  for (const o of overlays) for (const f of extractFlagSlugs(o.availability)) s.add(f);
  return [...s].sort();
}
function assignments(slugs) {
  const n = slugs.length; const res = [];
  for (let m = 0; m < 1 << n; m++) res.push(new Set(slugs.filter((_, i) => m & (1 << i))));
  return res;
}
const applicable = (overlays, flags) => overlays.filter((o) => evaluate(o.availability, flags));

function enumerate(label, overlays) {
  const slugs = distinctSlugs(overlays);
  const combos = assignments(slugs);
  const byHash = new Map();
  for (const f of combos) {
    const r = compose(BASE, applicable(overlays, f));
    const h = hash(r);
    byHash.set(h, (byHash.get(h) ?? 0) + 1);
  }
  const bytes = Buffer.byteLength(JSON.stringify(compose(BASE, overlays)));
  console.log(`[${label}] flags=${JSON.stringify(slugs)} k=${slugs.length} 2^k=${combos.length} distinct_artifacts=${byHash.size} ~bytes/artifact=${bytes}`);
  for (const [h, n] of byHash) console.log(`    artifact ${h}: ${n} flag assignment(s)`);
  return { k: slugs.length, combos: combos.length, distinct: byHash.size };
}

// ---------------------------------------------------------------- co-satisfiability (truth-table, cap on k)
const SAT_CAP = 16;
function coSatisfiable(a, b) {
  const slugs = distinctSlugs([{ availability: a }, { availability: b }]);
  if (slugs.length > SAT_CAP) return { result: 'unknown', slugs };
  for (const f of assignments(slugs)) if (evaluate(a, f) && evaluate(b, f)) return { result: true, witness: [...f], slugs };
  return { result: false, slugs };
}

function conflicts(overlays) {
  const groups = new Map(); // exclusive property + priority -> overlays assigning it
  for (const o of overlays) for (const op of o.ops) if (op.op === 'set_weather') {
    const k = `weather@${o.priority}`; groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const report = [];
  for (const [key, os] of groups) {
    const sorted = sortOverlays(os);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const cs = coSatisfiable(sorted[i].availability, sorted[j].availability);
      report.push({ property: key.split('@')[0], priority: sorted[i].priority, overlays: [sorted[i].slug, sorted[j].slug],
        co_satisfiable: cs.result, witness: cs.witness ?? null,
        code: cs.result === false ? null : 'SCENE_EXCLUSIVE_CONFLICT', severity: cs.result === false ? null : cs.result === 'unknown' ? 'hint' : 'error' });
    }
  }
  return report;
}

// ---------------------------------------------------------------- run
console.log('=== (1) variant enumeration: the two-overlay fixture ===');
const naive = mkOverlays('naive');
enumerate('naive  A=gave_space, B=pushed_away', naive);
console.log('\n=== conflict check (SC-304 rule, co-satisfiable pairs only) ===');
console.log('naive  :', JSON.stringify(conflicts(naive)));
const refined = mkOverlays('refined');
enumerate('refined A=gave_space&!pushed_away, B=pushed_away', refined);
console.log('refined:', JSON.stringify(conflicts(refined)));
console.log('all-pairs rule would flag refined as conflict: ', 'yes (same property, same priority) -> false positive');

console.log('\n=== k growth: n flag-gated overlays on one scene, each own flag, additive+exclusive mix ===');
for (const n of [2, 4, 8, 12, 16, 20]) {
  const os = Array.from({ length: n }, (_, i) => ({ slug: `o${i}`, priority: i, availability: flag(`f${i}`, true),
    ops: [{ op: 'add_dialogue_refs', refs: [`d${i}`] }, ...(i % 3 === 0 ? [{ op: 'set_weather', value: `w${i}` }] : [])] }));
  const slugs = distinctSlugs(os);
  const t0 = performance.now();
  const hs = new Set(); const total = 1 << slugs.length;
  if (slugs.length <= 16) for (const f of assignments(slugs)) hs.add(hash(compose(BASE, applicable(os, f))));
  const dt = performance.now() - t0;
  console.log(`n=${n} k=${slugs.length} 2^k=${total} distinct=${slugs.length <= 16 ? hs.size : 'skipped (>2^16)'} compile_ms=${slugs.length <= 16 ? dt.toFixed(1) : '-'} storage_at_${Buffer.byteLength(JSON.stringify(compose(BASE, os)))}B=${(total * Buffer.byteLength(JSON.stringify(compose(BASE, os))) / 1e6).toFixed(2)}MB/scene`);
}

console.log('\n=== real-content flag census (upper bound on k if flags gated scene overlays) ===');
const root = resolve(new URL('../../../content/dialogues', import.meta.url).pathname);
const flagsByFile = new Map();
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : /\.ya?ml$/.test(e) && scan(p); } };
function scan(p) {
  let doc; try { doc = yaml.load(readFileSync(p, 'utf8')); } catch { return; }
  const s = new Set();
  const visit = (v, key) => {
    if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if ((k === 'required_flags' || k === 'flag_set' || k === 'forbidden_flags') && x && typeof x === 'object' && !Array.isArray(x)) Object.keys(x).forEach((f) => s.add(f));
      else visit(x, k);
    }
  };
  visit(doc);
  if (s.size) flagsByFile.set(p.replace(root + '/', ''), s);
}
walk(root);
const all = new Set(); for (const s of flagsByFile.values()) s.forEach((f) => all.add(f));
const perFile = [...flagsByFile.values()].map((s) => s.size).sort((a, b) => a - b);
const pct = (q) => perFile[Math.min(perFile.length - 1, Math.floor(q * perFile.length))];
console.log(`dialogue files with flags=${perFile.length} distinct flags overall=${all.size} flags/file p50=${pct(0.5)} p95=${pct(0.95)} max=${perFile[perFile.length - 1]}`);
console.log(`2^overall would be 2^${all.size}: global enumeration is impossible; only per-scene k matters.`);

console.log('\n=== (2) runtime cost of ordered conditional layers ===');
const bench = (n, iters) => {
  const os = Array.from({ length: n }, (_, i) => ({ slug: `o${i}`, priority: i, availability: and([flag(`f${i}`, true), not(flag(`g${i}`, true))]),
    ops: [{ op: 'add_dialogue_refs', refs: [`d${i}`] }, { op: 'set_weather', value: `w${i}` }, { op: 'cast_slot', slot_id: 'bystander', cast: `c${i}` }] }));
  const flags = new Set(Array.from({ length: n }, (_, i) => (i % 2 ? `f${i}` : `g${i}`)));
  const lat = [];
  for (let w = 0; w < 2000; w++) compose(BASE, applicable(os, flags));
  for (let i = 0; i < iters; i++) { const t = performance.now(); compose(BASE, applicable(os, flags)); lat.push(performance.now() - t); }
  lat.sort((a, b) => a - b);
  return { n, p50: lat[Math.floor(iters * 0.5)], p95: lat[Math.floor(iters * 0.95)], max: lat[iters - 1] };
};
for (const n of [1, 2, 5, 10, 50]) { const r = bench(n, 5000); console.log(`layers=${r.n} evaluate+compose p50=${(r.p50 * 1000).toFixed(1)}us p95=${(r.p95 * 1000).toFixed(1)}us max=${(r.max * 1000).toFixed(1)}us`); }
console.log('SC-S6 re-run reference (2026-10-06): GET /dialogue/active p50=21.01ms p95=28.07ms; rest-of-endpoint p50=14.91ms; presigning p50=5.45ms');
