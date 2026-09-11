// SC-S4 spike: build the pg_trgm scratch corpus in a dedicated schema
// (spike_trgm), never touching production tables. Corpus = every character
// name in `characters` + every canonical location name found in
// content/districts/**/location_*.yaml (locations aren't in the DB yet —
// they only exist as content YAML, per SC-103's not-yet-built schema).
//
// Usage: DATABASE_URL=postgresql://... node scripts/spikes/sc-s4-build-corpus.mjs
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import * as yaml from 'js-yaml';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');

function findLocationYamls(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findLocationYamls(full));
    else if (/^location_.*\.yaml$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Hand-labeled near-duplicate pairs, all drawn from real `aliases:` fields in
// content/districts/**/location_*.yaml — see the write-up for provenance.
export const LABELED_PAIRS = [
  ['Plaza de la Constitucion', 'Plaza de la Constitución'],
  ['Rio Grande', 'Rio Grande Dam'],
  ['Museo Natural', 'Museo de Historia Natural'],
  ['Bolsa de Valores', 'Bolsa de Valores Las Flores'],
  ['Universidad Nacional', 'Universidad Nacional de Las Flores'],
  ['Parque de Atracciones', 'Parque de Atracciones Las Flores'],
  ['San Pedro', 'San Pedro de los Pescadores'],
  ['Vieja Las Flores', 'South Las Flores'],
  ['El Mercado Popular', 'Mercado Popular Las Flores'],
  ['Zona Rica', 'Northeast'],
  ['National Theater', 'Teatro Nacional'],
  ['WTCLF', 'World Trade Center Las Flores'],
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: charRows } = await client.query('SELECT name FROM characters');
  const names = new Set(charRows.map((r) => r.name));

  for (const file of findLocationYamls(CONTENT_DIR)) {
    const doc = yaml.load(fs.readFileSync(file, 'utf8'));
    if (doc?.name) names.add(doc.name);
  }
  for (const [, canon] of LABELED_PAIRS) names.add(canon);

  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await client.query('DROP SCHEMA IF EXISTS spike_trgm CASCADE');
  await client.query('CREATE SCHEMA spike_trgm');
  await client.query('CREATE TABLE spike_trgm.corpus (name text PRIMARY KEY)');
  await client.query(
    'CREATE INDEX corpus_trgm_idx ON spike_trgm.corpus USING gin (name gin_trgm_ops)'
  );
  await client.query('CREATE TABLE spike_trgm.labeled_pairs (id serial PRIMARY KEY, query text, expected_canonical text)');

  for (const name of names) {
    await client.query('INSERT INTO spike_trgm.corpus (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
  }
  for (const [query, canon] of LABELED_PAIRS) {
    await client.query('INSERT INTO spike_trgm.labeled_pairs (query, expected_canonical) VALUES ($1, $2)', [query, canon]);
  }

  console.log(`corpus size: ${names.size}`);
  console.log(`labeled pairs: ${LABELED_PAIRS.length}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
