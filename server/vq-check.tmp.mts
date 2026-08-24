import fs from 'fs';
import { load as loadYaml } from 'js-yaml';

const dir = '/home/anthony/code/las_flores_city/content/dialogues/valentina_quan_relationship';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
let fail = 0;
for (const f of files) {
  const data: any = loadYaml(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const nodeIds = new Set(Object.keys(data.nodes));
  if (!nodeIds.has(data.start_node_id)) { console.log(`${f}: MISSING start_node_id ${data.start_node_id}`); fail++; }
  if (data.character_id !== '670eea6f-3983-4d5a-8195-b08be6c81661') { console.log(`${f}: BAD character_id`); fail++; }
  if (data.dialogue_scope !== 'character') { console.log(`${f}: BAD scope`); fail++; }
  if (!(data.metadata?.tags || []).includes('valentina_quan')) { console.log(`${f}: missing valentina_quan tag`); fail++; }
  // flag key prefix check
  for (const [nid, node] of Object.entries<any>(data.nodes)) {
    const fx = node.effects?.flag_set ? Object.keys(node.effects.flag_set) : [];
    const sx = node.effects?.state_set ? Object.keys(node.effects.state_set) : [];
    const tx = node.effects?.stat_set ? Object.keys(node.effects.stat_set) : [];
    const gates = [
      ...Object.keys(node.conditions?.required_flags ?? {}), // n/a
    ];
    for (const k of [...fx, ...sx, ...tx]) {
      if (k !== 'last_vq_encounter_at' && !k.startsWith('vq_')) { console.log(`${f}:${nid}: non-vq key ${k}`); fail++; }
    }
    for (const ch of node.choices ?? []) {
      for (const m of ['required_flags','hidden_if'] as const) {
        for (const k of Object.keys(ch[m] ?? {})) if (!k.startsWith('vq_')) { console.log(`${f}:${nid}/${ch.id}: gate ${m} key ${k}`); fail++; }
      }
      for (const m of ['required_state','hidden_if_state'] as const) {
        for (const k of Object.keys(ch[m] ?? {})) if (!k.startsWith('vq_')) { console.log(`${f}:${nid}/${ch.id}: gate ${m} key ${k}`); fail++; }
      }
      for (const m of ['required_stats','hidden_if_stats'] as const) {
        for (const k of Object.keys(ch[m] ?? {})) if (!k.startsWith('vq_')) { console.log(`${f}:${nid}/${ch.id}: gate ${m} key ${k}`); fail++; }
      }
      if (ch.next_node_id && !nodeIds.has(ch.next_node_id)) { console.log(`${f}: ${nid} -> ${ch.id}: UNRESOLVED next_node_id ${ch.next_node_id}`); fail++; }
      // expression whitelist
      const exprs = new Set(['default','happy','smirk','focused','contemplative','vulnerable','tender','afraid','determined','sad','shocked','angry','calculating','surprised']);
      const e = node.visual?.expression;
      if (e && !exprs.has(e)) { console.log(`${f}:${nid}: unknown expression ${e}`); fail++; }
    }
  }
  console.log(`${f}: ${nodeIds.size} nodes checked`);
}
// tree id collisions across whole dialogues dir
const ids = new Map<string,string>();
for (const d of fs.readdirSync('/home/anthony/code/las_flores_city/content/dialogues')) {
  const p = `/home/anthony/code/las_flores_city/content/dialogues/${d}`;
  const list = fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(x=>x.endsWith('.yaml')).map(x=>`${p}/${x}`) : (p.endsWith('.yaml') ? [p] : []);
  for (const y of list) {
    const data: any = loadYaml(fs.readFileSync(y,'utf8'));
    if (ids.has(data.id)) console.log(`DUP TREE ID ${data.id}: ${y} vs ${ids.get(data.id)}`);
    ids.set(data.id, y);
  }
}
console.log(fail === 0 ? 'ALL CHECKS PASSED' : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
