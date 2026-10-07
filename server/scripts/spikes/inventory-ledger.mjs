#!/usr/bin/env node
// SC-S9: inventory-ledger shape. Re-runnable from repo root:
//   node server/scripts/spikes/inventory-ledger.mjs
// Parts: (1) content/server inventory of every item-possession surface (table of cases),
//        (2) hand-authored ledger sequences run through a tiny checker,
//        (3) Postgres check that plain `jsonb ||` cannot express ADD/REMOVE on an items array
//            (skipped, and said so, if DATABASE_URL is unreachable). Read-only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const req = createRequire(import.meta.url);
const yaml = req('js-yaml');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const yamls = walk(path.join(root, 'content')).filter((f) => /\.ya?ml$/.test(f));
const keyUse = {}; // key -> [files]
const KEYS = ['gives_item', 'requires_item', 'grant_item', 'vault_unlock', 'retire_vault_items', 'required_item', 'has_item', 'consume_item', 'item_ids', 'items'];
function visit(o, f) {
  if (Array.isArray(o)) return o.forEach((x) => visit(x, f));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (KEYS.includes(k) && !(Array.isArray(v) && v.length === 0 && k === 'retire_vault_items')) (keyUse[k] ??= []).push(path.basename(f));
    visit(v, f);
  }
}
const unreadable = [];
for (const f of yamls) { try { visit(yaml.load(fs.readFileSync(f, 'utf8')), f); } catch (e) { unreadable.push(`${path.relative(root, f)}: ${e.message.split('\n')[0]}`); } }
if (unreadable.length) console.log(`WARNING: scan INCOMPLETE — ${unreadable.length} YAML file(s) unreadable, totals below undercount:\n  ${unreadable.join('\n  ')}`);

console.log('== SC-S9 (1) content usage of item keys ==');
for (const k of KEYS) console.log(`  ${k.padEnd(20)} ${String((keyUse[k] ?? []).length).padStart(3)} occurrences ${[...new Set(keyUse[k] ?? [])].join(',')}`);

const vaultFiles = fs.readdirSync(path.join(root, 'content/vault'));
const vault = vaultFiles.flatMap((f) => yaml.load(fs.readFileSync(path.join(root, 'content/vault', f), 'utf8')).vault_items);
const byType = vault.reduce((a, v) => ((a[v.item_type] = (a[v.item_type] ?? 0) + 1), a), {});
const shop = yaml.load(fs.readFileSync(path.join(root, 'content/shop/cosmetics.yaml'), 'utf8')).shop_items;
console.log(`  vault_items: ${vault.length} ${JSON.stringify(byType)}; of which with mission_id: ${vault.filter((v) => v.mission_id).length}`);
console.log(`  shop_items: ${shop.length} (${shop.map((s) => s.item_type).join(', ')}) -> cosmetics, player_inventory (separate from player_vault)`);
const sceneDirs = fs.readdirSync(path.join(root, 'content/scenes'));
const withFeatures = sceneDirs.filter((d) => { const f = path.join(root, 'content/scenes', d, `scene_${d}.yaml`); try { return !!yaml.load(fs.readFileSync(f, 'utf8'))?.metadata?.features?.length; } catch { return false; } });
console.log(`  existing scenes with metadata.features (prop-like, never obtainable): ${withFeatures.length}/${sceneDirs.length}; scenes with any item key: 0`);

// server write paths into possession tables
const src = walk(path.join(root, 'server/src')).filter((f) => f.endsWith('.ts'));
const writes = [];
for (const f of src) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(INSERT INTO|DELETE FROM|UPDATE)\s+(player_vault|player_inventory|vault_items)\b/g)) writes.push(`${path.relative(root, f)} ${m[1]} ${m[2]}`);
}
console.log('  server possession writes (distinct):');
for (const w of [...new Set(writes)].sort()) console.log('    ', w);
const mig = fs.readFileSync(path.join(root, 'server/src/database/migrations/018_vault_system.sql'), 'utf8');
console.log(`  player_vault shape: PK(user_id,item_id) -> set membership; quantity column: ${/quantity|count/i.test(mig) ? 'yes' : 'NO'}; state/consumed/lost column: ${/consumed|lost|state/i.test(mig) ? 'yes' : 'NO'}; item_type lifecycle: clue -> memento (aftermath retire_vault_items)`);

// ---------- (2) ledger sequences ----------
// edge: (character, item) -> state. location edges: presence only, no lifecycle.
function run(name, events) {
  const led = new Map(); const out = [];
  for (const [op, who, item] of events) {
    const k = `${who}|${item}`; const s = led.get(k);
    if (op === 'acquire') { if (s === 'acquired') out.push(`noop: ${who} already holds ${item} (matches ON CONFLICT DO NOTHING)`); else led.set(k, 'acquired'); }
    else if (op === 'give' || op === 'use' || op === 'consume') {
      if (!s) out.push(`ERROR never-acquired: ${op} ${item} by ${who}`);
      else if (s !== 'acquired') out.push(`ERROR ${s}: ${op} ${item} by ${who}`);
      else if (op === 'consume') led.set(k, 'consumed');
      else if (op === 'give') led.set(k, 'given'); // giver no longer holds it
    } else if (op === 'lose') { if (s === 'acquired') led.set(k, 'lost'); else out.push(`ERROR cannot lose ${s ?? 'unheld'} ${item}`); }
  }
  console.log(`  ${name}: ${out.length ? out.join('; ') : 'clean'} | final=${JSON.stringify([...led])}`);
}
console.log('\n== SC-S9 (2) hand-authored sequences ==');
run('S-A acquire -> use (clue shown to NPC)', [['acquire', 'player', 'usb_drive'], ['use', 'player', 'usb_drive']]);
run('S-B use before acquire', [['use', 'player', 'usb_drive']]);
run('S-C single-use clue consumed then reused', [['acquire', 'player', 'key_card'], ['consume', 'player', 'key_card'], ['use', 'player', 'key_card']]);
run('S-D NPC gives item it never held', [['give', 'marco', 'usb_drive'], ['acquire', 'player', 'usb_drive']]);
run('S-E double grant (idempotent claim)', [['acquire', 'player', 'usb_drive'], ['acquire', 'player', 'usb_drive']]);

// ---------- (3) array-aware MODIFY (SC-S3 / SC-702 pitfall) ----------
console.log('\n== SC-S9 (3) overlay MODIFY on a scene `items` array (Postgres) ==');
let c; let connected = false;
try {
  const pg = req('pg');
  c = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores', connectionTimeoutMillis: 3000 });
  await c.connect();
  connected = true;
  const naive = (await c.query(`SELECT '{"items":[{"id":"lamp"},{"id":"desk"}]}'::jsonb || '{"items":[{"id":"safe"}]}'::jsonb AS r`)).rows[0].r;
  const aware = (await c.query(`SELECT jsonb_build_object('items', (SELECT jsonb_agg(e ORDER BY ord) FROM jsonb_array_elements('[{"id":"lamp"},{"id":"desk"}]'::jsonb || '[{"id":"safe"}]'::jsonb) WITH ORDINALITY t(e, ord))) AS r`)).rows[0].r;
  const removed = (await c.query(`SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(e ORDER BY ord) FROM jsonb_array_elements('[{"id":"lamp"},{"id":"desk"}]'::jsonb) WITH ORDINALITY t(e, ord) WHERE e->>'id' <> 'desk'), '[]'::jsonb)) AS r`)).rows[0].r;
  console.log('  base items [lamp,desk] + overlay ADD [safe]');
  console.log('  naive  jsonb ||      ->', JSON.stringify(naive), '(base props silently lost)');
  console.log('  array-aware concat   ->', JSON.stringify(aware));
  console.log('  array-aware REMOVE desk ->', JSON.stringify(removed), '(naive || cannot express removal)');
  const counts = await c.query(`SELECT (SELECT count(*) FROM vault_items) AS vault_items, (SELECT count(*) FROM player_vault) AS player_vault, (SELECT count(*) FROM player_inventory) AS player_inventory`);
  console.log('  live row counts:', JSON.stringify(counts.rows[0]));
} catch (e) { console.log(connected ? `  skipped — query failed (${e.message})` : `  skipped — Postgres unreachable (${e.message})`); }
finally { if (connected) await c.end(); }
