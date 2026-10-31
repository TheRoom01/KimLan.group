import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(path.resolve('package.json'));
const runtime=process.env.OFFLINE_SQL_RUNTIME || path.resolve('.zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite');
const {PGlite}=require(runtime);const {pg_trgm}=require(runtime+'/dist/contrib/pg_trgm.cjs');
async function main(){
 const db=new PGlite({extensions:{pg_trgm}});
 try{
  const schema=JSON.parse(fs.readFileSync('tools/rooms/fixtures/home-search-schema.json','utf8'));
  const columns=schema.columns.map((name:string)=>name==='id'?'id uuid default gen_random_uuid() primary key':name==='room_id'?'room_id uuid unique':name.endsWith('_value')?`${name} numeric`:name==='detail_json'?`${name} jsonb`:name==='created_at'?`${name} timestamptz default now()`:/^(has_|allow_|no_pet|short_term|long_term|free_time|fingerprint_|shared_|private_)/.test(name)?`${name} boolean`:`${name} text`).join(',');
  await db.exec(`create schema extensions;create extension pg_trgm with schema extensions;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('offline.uid',true),'')::uuid$$;
   create function public.can_manage_room(uuid) returns boolean language sql as 'select false';
   create table admin_users(user_id uuid,level int,phone text,full_name text,display_name text);
   create table properties(id uuid primary key,code text,name text,approval_status text,lifecycle_status text);
   create table rooms(id uuid primary key,property_id uuid,owner_id uuid,room_code text,room_type text,house_number text,address text,ward text,district text,price integer,status text,available_from date,description text,created_at timestamptz default now(),updated_at timestamptz default now(),gallery_urls text[],link_zalo text,zalo_phone text,chinh_sach text,google_maps_url text,lat double precision,lng double precision,is_hidden boolean default false,lifecycle_status text default 'active',publish_status text default 'published',badges text[] default '{}');
   create table room_details(${columns});create table room_media(id uuid,room_id uuid,type text,url text,path text,provider text,is_cover boolean,sort_order int,created_at timestamptz default now());
   create table pending_room_versions(id uuid,room_payload jsonb,detail_payload jsonb,status text,matched_room_id uuid,batch_id uuid,approved_room_id uuid,approved_at timestamptz,approved_by uuid,auto_approve_enabled boolean,auto_approve_at timestamptz,auto_approve_actor_id uuid,auto_approve_processing_at timestamptz);
   create table zalo_import_batches(id uuid,status text);create table vip_access_links(token_hash text,revoked_at timestamptz,expires_at timestamptz);create table anon_sessions(id uuid,created_at timestamptz,unlocked_until timestamptz);`);
  for(const name of ['norm_room_search_text','room_address_search_document','room_address_search_score']) await db.exec(schema.functions.find((f:any)=>f.name===name).definition);
  await db.exec(`alter table rooms add column search_address_text text generated always as(public.room_address_search_document(house_number,address,ward,district)) stored;`);
  for(const view of [...schema.views].sort((a:any,b:any)=>Number(b.name==='room_media_agg')-Number(a.name==='room_media_agg'))) await db.exec(`create view public.${view.name} as ${view.definition}`);
  for(const name of ['save_room_details_v1_without_free_time','save_room_details_v1','approve_zalo_room_update_v1','fetch_rooms_cursor_full_v1'])await db.exec(schema.functions.find((f:any)=>f.name===name).definition);
  const migration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_room_balcony_window_public_search.sql'))!;
  await db.exec(fs.readFileSync(path.join('supabase/migrations',migration),'utf8'));
  const admin=randomUUID(),l2=randomUUID(),property=randomUUID(),session=randomUUID(),a=randomUUID(),b=randomUUID(),c=randomUUID();
  await db.query("insert into admin_users(user_id,level) values($1,1),($2,2);",[admin,l2]);
  await db.query("insert into properties values($1,'KL-OFFLINE','Fixture','approved','active')",[property]);
  await db.query("insert into anon_sessions values($1,now(),now()+interval '1 hour')",[session]);
  for(const [id,house,address,ward,district,description] of [[a,'991A','Sao Mai','Phường 13','Tân Bình','Căn 991A: có sân vườn riêng'],[b,'882B','Trần Hưng Đạo','Phường 5','Quận 1','Nội thất tối giản'],[c,'773C','Sao Mai','Phường 13','Tân Bình','Không gian yên tĩnh']])await db.query("insert into rooms(id,property_id,owner_id,room_code,room_type,house_number,address,ward,district,price,status,description,link_zalo,zalo_phone) values($1,$2,$3,'101','Studio',$4,$5,$6,$7,6500000,'Đang trống',$8,'private-link','private-phone')",[id,property,admin,house,address,ward,district,description]);
  await db.query("select set_config('offline.uid',$1,false)",[admin]);
  await db.query("select save_room_details_v1($1,$2)",[a,{has_balcony:true,has_window:true,other_amenities:'Sân thượng BBQ'}]);
  await db.query("select save_room_details_v1($1,$2)",[b,{has_window:true}]);await db.query("select save_room_details_v1($1,$2)",[c,{has_balcony:true}]);
  await db.query("select save_room_details_v1($1,$2)",[a,{water_fee_value:25000}]);
  assert.equal((await db.query('select has_balcony,has_window from room_details where room_id=$1',[a])).rows[0].has_balcony,true,'unrelated fee edits preserve amenities');
  const fetch=async(query:string|null=null,statuses:string[]|null=null,cursor:any=null,claimedRole=0,limit=20)=>{
   const result=await db.query("select fetch_rooms_cursor_full_v1($1,$6,$2,$3,null,null,null,null,null,null,null,$4,'updated_desc',$7,$8,$2,$5,null) result",[claimedRole,cursor?.id||cursor,query,statuses,session,limit,cursor?.updated_at||null,cursor?.created_at||null]);return result.rows[0].result;
  };
  await db.query("select set_config('offline.uid','',false)");
  for(const query of ['991A','882B','773C'])assert.equal((await fetch(query)).data.length,0,'anon cannot locate house-only matches, including repeated numbers in descriptions');
  const combined=await fetch('991a sao mai');assert.equal(combined.data.some((room:any)=>room.id===a),combined.data.some((room:any)=>room.id===c),'adding a private house number cannot distinguish two rooms on the same public address');
  assert.equal((await fetch('SAO MAI')).data.length,2);assert.equal((await fetch('SÂN VƯỜN')).data[0].id,a);assert.equal((await fetch('BBQ')).data[0].id,a);
  const first=await fetch('Sao Mai',null,null,0,1);assert.equal(first.data.length,1);assert.equal(first.total_count,2);
  const second=await fetch('Sao Mai',null,first.nextCursor,0,1);assert.equal(second.data.length,1);assert.notEqual(second.data[0].id,first.data[0].id,'public search cursor uses the same score and never repeats the previous page');
  assert.equal((await fetch('phường 13')).data.length,2);assert.equal((await fetch('quận 1')).data[0].id,b);
  assert.equal((await fetch(null,['__amenity:balcony'])).data.length,2);assert.equal((await fetch(null,['__amenity:window'])).data.length,2);
  const both=await fetch(null,['__amenity:balcony','__amenity:window']);assert.equal(both.data.length,1);assert.equal(both.data[0].id,a);assert.equal(both.data[0].room_detail.has_window,true);
  assert.equal((await fetch('991A',null,null,1)).data.length,0,'forged p_role cannot search private house numbers');
  await db.query("select set_config('offline.uid',$1,false)",[admin]);assert.equal((await fetch('991A')).data[0].id,a);assert.equal((await fetch('BBQ')).data[0].id,a);
  await db.query('select save_room_details_v1($1,$2)',[a,{has_balcony:false}]);assert.equal((await db.query('select has_window from room_details where room_id=$1',[a])).rows[0].has_window,true,'changing one new checkbox preserves the other');
  await db.query("select set_config('offline.uid',$1,false)",[l2]);const own=await fetch('991A');assert.equal(own.data[0].id,a);assert.equal(own.data[0].link_zalo,null,'L2 private-field ownership remains enforced');
  await db.query("select set_config('offline.uid','',false)");await assert.rejects(()=>db.query('select save_room_details_v1($1,$2)',[a,{has_balcony:false}]),/UNAUTHENTICATED/);
  console.log('SQL amenities round trip / public address+description+other amenities / ward+district / anon house exclusion / L1-L2 ownership / forged roles: PASS (offline PostgreSQL)');
 }finally{await db.close()}
}
main().catch(error=>{console.error(error.message,error.where||'');process.exitCode=1});
