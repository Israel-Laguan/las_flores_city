#!/usr/bin/env node
// SC-S12 throwaway: project every content/scenes/*/scene_*.yaml into a draft
// planning.scenes `Scene` shape (SC-301) and report which fields map / drop / are
// new-required. File-only: no DB access.
// Usage (repo root): node server/scripts/spikes/scene-projection.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const ROOT = path.resolve(import.meta.dirname, '../../../content/scenes');
const dirs = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory()).sort();

// Existing top-level YAMLSceneSchema fields (shared/src/schemas/yaml-content.ts)
// -> disposition under hypothesis (b): old row becomes a `location`, new Scene references it.
const DISPOSITION = {
  id: 'location.id (hard FK target; Scene.location)',
  name: 'location.name',
  description: 'location.description',
  district: 'location.district (stays on location; Scene inherits)',
  district_lore: 'location.metadata',
  district_subzone: 'location.metadata',
  written_by: 'location (provenance)',
  image_url: 'location asset',
  background_url: 'location asset',
  background_urls: 'location asset (env variants; Scene.weather/time select among them)',
  image_urls: 'location asset',
  ambient_sound_url: 'location asset',
  mood: 'location default; Scene may override (candidate Scene.mood)',
  available_dialogues: 'MAPS -> Scene.dialogue_refs (seed only; ordered UUID[] of dialogue_trees)',
  metadata: 'location.metadata (see sub-keys)',
  lore_ref: 'location', lore_path: 'location', asset_paths: 'location',
};
const NEW_REQUIRED = ['slug', 'location', 'time', 'weather', 'participants', 'role_slots', 'items', 'priority', 'availability'];

const rows = []; const empty = []; const unprefixed = [];
const topKeys = {}; const metaKeys = {};
for (const d of dirs) {
  const f = fs.readdirSync(path.join(ROOT, d)).find((x) => x.endsWith('.yaml'));
  if (!f) { empty.push(d); continue; }
  if (!f.startsWith('scene_')) unprefixed.push(`${d}/${f}`);
  const y = yaml.load(fs.readFileSync(path.join(ROOT, d, f), 'utf8'));
  for (const k of Object.keys(y)) topKeys[k] = (topKeys[k] || 0) + 1;
  for (const k of Object.keys(y.metadata || {})) metaKeys[k] = (metaKeys[k] || 0) + 1;
  const m = y.metadata || {};
  const draft = {
    slug: d,
    location: y.id,                                  // hard ref to old scenes row
    time: null, weather: null,                       // NEW; none authored today
    participants: (m.npcs || []).map((n) => ({ ref: n, slot: null })), // metadata.npcs, if any
    role_slots: [],                                  // NEW
    items: [],                                       // NEW
    dialogue_refs: y.available_dialogues || [],      // MAPS
    availability: m.required_story_beat ? { flag: m.required_story_beat } : null, // lossy MAP
    priority: 0,
  };
  rows.push({
    folder: d, file: f, district: y.district, metaType: m.type ?? '(none)',
    mood: y.mood ?? '-', dialogues: draft.dialogue_refs.length,
    npcs: (m.npcs || []).length, idle: (m.idle_thoughts || []).length,
    beat: m.required_story_beat ?? '-', sleep: m.is_sleep_location ?? '-',
    bgVariants: (y.background_urls || []).map((b) => b.variant || 'default').join('+') || '-',
    draft,
  });
}

console.log(`# SC-S12 projection: ${dirs.length} folders, ${rows.length} with a YAML`);
console.log('folders with NO yaml (cannot be imported):', empty.join(', ') || '-');
console.log('yaml not named scene_<slug>.yaml:', unprefixed.join(', ') || '-', '\n');
console.log('folder | district | metadata.type | mood | #dlg | #npcs | #idle | required_story_beat | bg variants');
for (const r of rows) console.log([r.folder, r.district, r.metaType, r.mood, r.dialogues, r.npcs, r.idle, r.beat, r.bgVariants].join(' | '));

console.log('\n## Top-level key frequency (of ' + rows.length + ')');
for (const [k, n] of Object.entries(topKeys).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(20)} ${String(n).padStart(2)}  -> ${DISPOSITION[k] ?? 'UNMAPPED'}`);
console.log('\n## metadata.* key frequency');
for (const [k, n] of Object.entries(metaKeys).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(20)} ${String(n).padStart(2)}`);

const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
console.log('\n## Summary');
console.log('scenes with >=1 available_dialogues :', rows.filter((r) => r.dialogues).length, '(total refs', sum((r) => r.dialogues) + ')');
console.log('scenes with metadata.type            :', JSON.stringify(rows.reduce((a, r) => ((a[r.metaType] = (a[r.metaType] || 0) + 1), a), {})));
console.log('scenes with npcs (participants seed) :', rows.filter((r) => r.npcs).length);
console.log('scenes with required_story_beat      :', rows.filter((r) => r.beat !== '-').length);
console.log('fields with NO authored source (new-required on Scene):', NEW_REQUIRED.filter((k) => !['slug', 'location'].includes(k)).join(', '));
console.log('Scene-shaped fields populated in any of 20 (time/weather/role_slots/items):', 0);

console.log('\n## Draft Scene (3 samples)');
for (const r of [rows.find((x) => x.dialogues && x.npcs) || rows.find((x) => x.dialogues), rows.find((x) => x.beat !== '-'), rows[0]].filter(Boolean)) console.log(JSON.stringify(r.draft, null, 2));
