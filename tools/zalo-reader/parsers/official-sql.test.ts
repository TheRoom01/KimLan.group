import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { officialSourceIdentity } from "../../../lib/zalo-reader/official-request";
import { OFFICIAL_ZALO_GROUPS as GROUPS } from "../../../lib/zalo-reader/official";
import { normalizedRoomIdentity } from "../../../lib/zalo-import/room-comparison";
const { PGlite }=createRequire(path.resolve("package.json"))(process.env.OFFLINE_SQL_RUNTIME || path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
async function main() {
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table rooms(id uuid primary key,price numeric);insert into rooms values(gen_random_uuid(),5500000);
   create table zalo_import_batches(id uuid primary key,group_name text,sender_name text,source_message_id text,source_hash text unique,raw_text text,sent_at timestamptz,status text,parser_version text,parser_result jsonb);
   create table pending_room_versions(id uuid primary key,batch_id uuid unique references zalo_import_batches,status text,confidence_score numeric,room_payload jsonb,detail_payload jsonb,source_field_map jsonb,inherited_field_map jsonb,matched_room_id uuid,matched_reason text,old_status text,new_status text,auto_approve_enabled boolean,auto_approve_at timestamptz,auto_approve_actor_id uuid);
   create table zalo_import_images(id uuid primary key default gen_random_uuid(),batch_id uuid references zalo_import_batches,temp_r2_key text,temp_image_url text,original_name text,mime_type text,size_bytes bigint,selected boolean,sort_order int);
   create table zalo_import_videos(id uuid primary key default gen_random_uuid(),batch_id uuid references zalo_import_batches,temp_r2_key text,temp_video_url text,temp_thumb_r2_key text,temp_thumb_url text,source_url text,source_thumb_url text,mime_type text,size_bytes bigint,duration_ms bigint,width int,height int,selected boolean,sort_order int);
   create unique index pending_zalo_room_identity_active_uq on pending_room_versions((room_payload->'_room_import'->>'identity_key')) where status='Chờ duyệt' and coalesce(room_payload->>'is_test_import','false')<>'true';
   create function approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb) returns jsonb language sql as 'select null::jsonb';`);
  await db.exec(fs.readFileSync("supabase/sql/zalo-reader-official.sql","utf8"));
  assert.equal((await db.query("select zalo_reader_readiness_v1() ready")).rows[0].ready,true);
  const runId=randomUUID(); const now=new Date().toISOString();
  await db.query("update zalo_reader_groups set group_id='g1234567890123' where group_key=$1",[GROUPS[1].key]);
  for(const group of GROUPS) await db.query("insert into zalo_reader_runs(run_id,group_key,group_id,mode,status,started_at,heartbeat_at,window_from,window_to) values($1,$2,$3,'trial','running',$4,$4,$4,$4)",[runId,group.key,group.groupId||"g1234567890123",now]);
  const fixture=(index:number)=>{
   const group=GROUPS[index%2];const room={house_number:"10",address:"Nguyễn Huệ",district:"Quận 1",room_code:String(400+index)};
   const identity=officialSourceIdentity({groupName:group.name,groupId:group.groupId||"g1234567890123",sourceMessageId:`message-${index}`,sourceRoomKey:normalizedRoomIdentity(room)!,runId,trial:true,verified:true},room);
   return {batch:{id:identity.batchId,group_name:group.name,sender_name:"Fixture",source_message_id:`message-${index}`,source_hash:identity.sourceHash,raw_text:"Offline fixture",sent_at:now,parser_version:"fixture",parser_result:{official_source:identity.metadata}},
    pending:{id:identity.pendingId,batch_id:identity.batchId,status:"Chờ duyệt",confidence_score:0.9,room_payload:{...room,is_test_import:true},detail_payload:{},auto_approve_enabled:false,auto_approve_at:null},
    images:[{batch_id:identity.batchId,temp_r2_key:"fixture/key",temp_image_url:"https://example.test/image",mime_type:"image/jpeg",size_bytes:10,sort_order:0}],videos:[]};
  };
  const send=async(value:ReturnType<typeof fixture>)=>(await db.query("select finalize_zalo_official_source_v1($1,$2,$3,$4,$5) result",[value.batch,value.pending,value.images,value.videos,runId])).rows[0].result;
  const first=fixture(0);
  assert.equal((await send(first)).created,true);
  const retry=structuredClone(first);Object.assign(retry.pending.room_payload,{price:1});
  assert.equal((await send(retry)).created,false);
  assert.equal((await db.query("select room_payload->>'price' price from pending_room_versions where id=$1",[first.pending.id])).rows[0].price,null,"retry must not overwrite existing Pending");
  const bad=fixture(99);bad.images[0].batch_id=randomUUID();
  await assert.rejects(()=>send(bad),/MEDIA_BATCH_MISMATCH/);
  assert.equal((await db.query("select count(*)::int n from zalo_import_batches")).rows[0].n,1,"failure rolls back batch AND Pending AND media links");
  const invalid=fixture(98);invalid.pending.auto_approve_enabled=true;
  await assert.rejects(()=>send(invalid),/OFFICIAL_PAYLOAD_INVALID/);
  for(let i=1;i<10;i++) assert.equal((await send(fixture(i))).created,true);
  await assert.rejects(()=>send(fixture(10)),/TRIAL_ROOM_LIMIT/);
  assert.equal((await db.query("select count(*)::int n from pending_room_versions")).rows[0].n,10);
  assert.equal((await db.query("select price::int price from rooms")).rows[0].price,5500000,"main rooms unchanged");
  const statusRun=randomUUID();
  const event={run_id:statusRun,group_key:GROUPS[0].key,group_id:GROUPS[0].groupId,mode:"official",status:"running",started_at:now,heartbeat_at:now,counters:{},window_from:now,window_to:now};
  const report=(value:any)=>db.query("select report_zalo_reader_status_v1($1)",[value]);
  await report(event);
  const videoRoom={house_number:"100/2A2",address:"Trần Hưng Đạo",district:"Quận 1",room_code:"503",room_type:"2PN",price:16000000};
  const videoIdentity=officialSourceIdentity({groupName:GROUPS[0].name,groupId:GROUPS[0].groupId!,sourceMessageId:"video-only-503",sourceRoomKey:normalizedRoomIdentity(videoRoom)!,runId:statusRun,trial:false,verified:true},videoRoom);
  const videoBatch={id:videoIdentity.batchId,group_name:GROUPS[0].name,source_message_id:"video-only-503",source_hash:videoIdentity.sourceHash,sent_at:now,raw_text:"Offline fixture",parser_result:{official_source:videoIdentity.metadata}};
  const videoPending={id:videoIdentity.pendingId,batch_id:videoIdentity.batchId,status:"Chờ duyệt",room_payload:{...videoRoom,_manual_video_required:true,_reader_manual_review:true},detail_payload:{},auto_approve_enabled:false};
  const videoReceipt=(await db.query("select finalize_zalo_official_source_v1($1,$2,'[]'::jsonb,'[]'::jsonb,$3) result",[videoBatch,videoPending,statusRun])).rows[0].result;
  assert.equal(videoReceipt.created,true);
  assert.equal((await db.query("select count(*)::int n from zalo_import_videos where batch_id=$1",[videoIdentity.batchId])).rows[0].n,0,"manual-video draft does not fabricate saved video rows");
  await report({...event,status:"idle",finished_at:now});
  await report(event);
  assert.equal((await db.query("select status from zalo_reader_runs where run_id=$1",[statusRun])).rows[0].status,"idle","late heartbeat cannot reopen a finished run");
  await assert.rejects(()=>report({...event,run_id:randomUUID(),group_id:"g9999999999999"}),/GROUP_ID_CHANGED/);
  await db.exec("set role authenticated");
  await assert.rejects(()=>db.query("select * from zalo_reader_runs"),/permission denied/);
  await assert.rejects(()=>db.query("select zalo_reader_readiness_v1()"),/permission denied/);
  await db.exec("reset role");
  console.log("Official SQL transaction / retry / 10-room trial budget / privileges: PASS");
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
