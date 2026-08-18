import { queryOLTP, invalidatePattern } from '@las-flores/infra';
import { buildSnapshotsForTree, getSnapshotContentUrl, buildSetHash } from './src/services/SnapshotService.js';
import { DialogueResolver } from './src/services/DialogueResolver.js';

const TREE='d0d00000-0000-4000-8000-000000000001';
const ACTIVE=['d0d00000-0000-4000-8000-000000000101','d0d00000-0000-4000-8000-000000000102','d0d00000-0000-4000-8000-000000000103'];
const mk=(n:number,p:string)=>{const m:any={};for(let i=0;i<n;i++){const id=`${p}_${String(i).padStart(4,'0')}`;m[id]={id,text:p,choices:[]}}return m;};
try {
await queryOLTP(`INSERT INTO mysteries (id,title,description,status) VALUES ($1,$2,$3,'ACTIVE') ON CONFLICT (id) DO NOTHING`,[ACTIVE[0],'a','a']);
await queryOLTP(`INSERT INTO dialogue_trees (id,name,start_node_id,nodes,updated_at,dialogue_scope) VALUES ($1,$2,$3,$4::jsonb,NOW(),'system') ON CONFLICT (id) DO UPDATE SET nodes=EXCLUDED.nodes`,[TREE,'t','base_0000',JSON.stringify(mk(150,'base'))]);
for(const mid of ACTIVE){await queryOLTP(`INSERT INTO dialogue_overlays (id,name,target_tree_id,mystery_id,nodes,is_nsfw,unlock_condition,updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,false,'none',NOW()) ON CONFLICT (id) DO NOTHING`,[`d0d00000-0000-4000-8000-0000000003${mid.slice(34)}`,`o_${mid.slice(30)}`,TREE,mid,JSON.stringify(mk(60,'ov'))]);}
const sr=await buildSnapshotsForTree(TREE);
console.log('snapshots built', sr.chunksCreated, 'errors', sr.errors.length);
const sh=buildSetHash(ACTIVE);
console.log('setHash', sh);
const c1=await queryOLTP(`SELECT chunk_key, content_url IS NOT NULL AS has_url FROM dialogue_chunks WHERE tree_id=$1 AND chunk_key=$2`,[TREE,`__snapshot_${sh}_f_neutral`]);
console.log('OLTP lookup:', JSON.stringify(c1.rows));
const url=await getSnapshotContentUrl(TREE,sh,false,'neutral');
console.log('getSnapshotContentUrl ->', url);
await queryOLTP(`INSERT INTO users (id,email,username,display_name,role) VALUES ('d0d00000-0000-4000-8000-000000000f01','p@x.local','px','PX','player') ON CONFLICT DO NOTHING`);
await queryOLTP(`INSERT INTO player_states (user_id,alignment,story_beat) VALUES ('d0d00000-0000-4000-8000-000000000f01','neutral','prologue') ON CONFLICT DO NOTHING`);
await queryOLTP(`INSERT INTO user_entitlements (user_id,is_nsfw_unlocked) VALUES ('d0d00000-0000-4000-8000-000000000f01',false) ON CONFLICT DO NOTHING`);
await invalidatePattern('dialogue:resolved:*');
const t=performance.now();
const r=await DialogueResolver.resolveTreeForUser('d0d00000-0000-4000-8000-000000000f01',TREE);
console.log('resolve ms',(performance.now()-t).toFixed(1),'nodes',Object.keys(r.nodes).length);
// cleanup
await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id=$1 AND chunk_key LIKE '__snapshot_%'`,[TREE]);
await queryOLTP(`DELETE FROM dialogue_overlays WHERE target_tree_id=$1`,[TREE]);
await queryOLTP(`DELETE FROM dialogue_trees WHERE id=$1`,[TREE]);
await queryOLTP(`DELETE FROM user_entitlements WHERE user_id='d0d00000-0000-4000-8000-000000000f01'`);
await queryOLTP(`DELETE FROM player_states WHERE user_id='d0d00000-0000-4000-8000-000000000f01'`);
await queryOLTP(`DELETE FROM users WHERE id='d0d00000-0000-4000-8000-000000000f01'`);
} catch(e:any){ console.error('PROBE ERROR:', e?.message); }
