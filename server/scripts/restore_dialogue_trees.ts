// Quick restore: re-seed dialogue_trees from the YAML content files.
// One-off script to recover state after a test accidentally wiped the table.
import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { queryOLTP, oltpPool } from '../src/database/connection.js';

// Map: filename -> (tree id, optional source yaml's own id)
// For the test suite to work, the tree at the scene's
// `available_dialogues` slot (550e8400-... = Welcome Center)
// must contain Vance as a speaker. That content lives in
// `dialogue_awakening.yaml` despite that file's own `id` field.
const TREE_IDS: Record<string, { id: string; yamlIdOverride?: string }> = {
  'dialogue_awakening.yaml': { id: '550e8400-e29b-41d4-a716-446655440003' },
  'welcome_dialogue.yaml': { id: '550e8400-e29b-41d4-a716-446655440002' },
  'handler_welcome.yaml': { id: 'd4e5f6a7-b8c9-0123-defa-234567890123' },
  'dialogue_first_contact.yaml': { id: '123e4567-e89b-12d3-a456-426614174002' },
  'first_contact_barista.yaml': { id: 'c9a646d3-9c61-4cd8-bc11-657ab255b1bf' },
};

async function main() {
  const contentDir = process.argv[2] || './content';
  for (const [file, { id: treeId }] of Object.entries(TREE_IDS)) {
    const path = join(contentDir, 'dialogues', file);
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (e) {
      console.log(`SKIP ${file}: ${(e as Error).message}`);
      continue;
    }
    const data: any = yaml.load(raw);
    if (!data || !data.nodes) {
      console.log(`SKIP ${file}: no nodes`);
      continue;
    }
    await queryOLTP(
      `INSERT INTO dialogue_trees (id, name, description, start_node_id, nodes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         start_node_id = EXCLUDED.start_node_id,
         nodes = EXCLUDED.nodes,
         metadata = EXCLUDED.metadata`,
      [
        treeId,
        data.name ?? file,
        data.description ?? null,
        data.start_node_id ?? data.root_node_id ?? Object.keys(data.nodes)[0],
        JSON.stringify(data.nodes),
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    console.log(`RESTORED ${file} -> ${treeId}`);
  }
  await oltpPool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
