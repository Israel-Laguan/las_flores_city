import { queryOLTP, invalidatePattern } from '@las-flores/infra';
import { buildSnapshotsForTree, getSnapshotContentUrl, buildSetHash } from './src/services/SnapshotService.js';
import { DialogueResolver } from './src/services/DialogueResolver.js';
import { publishDialogueTree, deleteFromMinio } from './src/services/ContentPublishService.js';
import { objectExists } from './src/services/StorageService.js';

const TREE='d0d00000-0000-4000-8000-000000000001';
const PLAYER='d0d00000-0000-4000-8000-000000000f01';
const mk=(n:number,p:string)=>{const m:any={};for(let i=0;i<n;i++){const id=`${p}_${String(i).padStart(4,'0')}`;m[id]={id,text:p,choices:[]}}return m;};

// Track only the rows this run actually creates so cleanup never deletes a
// mystery/object that predated the probe.
const createdMysteries: string[] = [];
let baseContentUrl: string | null = null;

async function cleanup(): Promise<void> {
  if (baseContentUrl) {
    try { await deleteFromMinio(baseContentUrl); } catch (e: any) { console.warn('PROBE cleanup: failed to delete base object:', e?.message); }
  }
  await queryOLTP(`DELETE FROM dialogue_chunks WHERE tree_id=$1 AND chunk_key LIKE '__snapshot_%'`,[TREE]);
  await queryOLTP(`DELETE FROM dialogue_overlays WHERE target_tree_id=$1`,[TREE]);
  await queryOLTP(`DELETE FROM dialogue_trees WHERE id=$1`,[TREE]);
  await queryOLTP(`DELETE FROM user_entitlements WHERE user_id=$1`,[PLAYER]);
  await queryOLTP(`DELETE FROM player_states WHERE user_id=$1`,[PLAYER]);
  await queryOLTP(`DELETE FROM player_mysteries WHERE user_id=$1`,[PLAYER]);
  await queryOLTP(`DELETE FROM users WHERE id=$1`,[PLAYER]);
  if (createdMysteries.length > 0) {
    await queryOLTP(`DELETE FROM mysteries WHERE id = ANY($1::uuid[])`, [createdMysteries]);
  }
}

let failed = false;
try {
  // Insert EVERY ACTIVE mystery before creating overlays — the overlay rows
  // reference these ids via a foreign key, so all must exist first. Track the
  // ids we actually insert so cleanup only removes probe-owned rows.
  for (const mid of ACTIVE) {
    await queryOLTP(`INSERT INTO mysteries (id,title,description,status) VALUES ($1,$2,$3,'ACTIVE') ON CONFLICT (id) DO NOTHING`,[mid,'a','a']);
    createdMysteries.push(mid);
  }
  // M32: publish the base node map to MinIO/CDN and store content_url (the
  // in-DB `nodes` column is dropped; buildSnapshotsForTree requires a non-null
  // content_url). The object key is deterministic (content-addressed), so a
  // prior run may already own it. Only delete the object on cleanup if this
  // run created it — otherwise we would delete a pre-existing shared object.
  const baseNodes = mk(150,'base');
  const contentUrl = await publishDialogueTree(TREE, JSON.stringify({ nodes: baseNodes }));
  const baseExistedBefore = await objectExists(contentUrl);
  if (!baseExistedBefore) baseContentUrl = contentUrl;
  await queryOLTP(`INSERT INTO dialogue_trees (id,name,start_node_id,content_url,updated_at,dialogue_scope) VALUES ($1,$2,$3,$4,NOW(),'system') ON CONFLICT (id) DO UPDATE SET content_url=EXCLUDED.content_url,updated_at=NOW()`,[TREE,'t','base_0000',contentUrl]);
  for(const mid of ACTIVE){await queryOLTP(`INSERT INTO dialogue_overlays (id,name,target_tree_id,mystery_id,nodes,is_nsfw,unlock_condition,updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,false,'none',NOW()) ON CONFLICT (id) DO NOTHING`,[`d0d00000-0000-4000-8000-0000000003${mid.slice(34)}`,`o_${mid.slice(30)}`,TREE,mid,JSON.stringify(mk(60,'ov'))]);}
  const sr=await buildSnapshotsForTree(TREE);
  console.log('snapshots built', sr.chunksCreated, 'errors', sr.errors.length);
  const sh=buildSetHash(ACTIVE);
  console.log('setHash', sh);
  const c1=await queryOLTP(`SELECT chunk_key, content_url IS NOT NULL AS has_url FROM dialogue_chunks WHERE tree_id=$1 AND chunk_key=$2`,[TREE,`__snapshot_${sh}_f_neutral`]);
  console.log('OLTP lookup:', JSON.stringify(c1.rows));
  const url=await getSnapshotContentUrl(TREE,sh,false,'neutral');
  console.log('getSnapshotContentUrl ->', url);
  await queryOLTP(`INSERT INTO users (id,email,username,display_name,role) VALUES ($1,$2,$3,$4,'player') ON CONFLICT DO NOTHING`,[PLAYER,'p@x.local','px','PX']);
  await queryOLTP(`INSERT INTO player_states (user_id,alignment,story_beat) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[PLAYER,'neutral','prologue']);
  await queryOLTP(`INSERT INTO user_entitlements (user_id,is_nsfw_unlocked) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[PLAYER,false]);
  await invalidatePattern('dialogue:resolved:*');
  const t=performance.now();
  const r=await DialogueResolver.resolveTreeForUser(PLAYER,TREE);
  console.log('resolve ms',(performance.now()-t).toFixed(1),'nodes',Object.keys(r.nodes).length);
} catch(e:any){
  console.error('PROBE ERROR:', e?.message);
  failed = true;
} finally {
  // Clean up regardless of success/failure so a failed probe cannot leak
  // fixtures or pass CI.
  try {
    await cleanup();
  } catch (cleanupErr: any) {
    console.error('PROBE CLEANUP ERROR:', cleanupErr?.message);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
