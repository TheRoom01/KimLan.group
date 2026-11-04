import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(path.resolve("package.json"));
const runtime = process.env.OFFLINE_SQL_RUNTIME || path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite");
const { PGlite } = require(runtime);
const { pg_trgm } = require(runtime + "/dist/contrib/pg_trgm.cjs");

async function main() {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    const schema = JSON.parse(fs.readFileSync("tools/rooms/fixtures/recommendation-schema.json", "utf8"));
    const detail = schema.detailColumns.map((c: {column:string;type:string}) => `${c.column} ${c.type}${c.column === "room_id" ? " unique" : ""}`).join(",");
    await db.exec(`create schema extensions; create extension pg_trgm with schema extensions;
      create role anon;create role authenticated;create role service_role bypassrls;
      create table properties(id uuid primary key,code text,name text,approval_status text,lifecycle_status text,latitude float8,longitude float8);
      create table rooms(id uuid primary key,property_id uuid,owner_id uuid,room_code text,room_type text,house_number text,address text,ward text,district text,
        price bigint,status text,description text,created_at timestamptz,updated_at timestamptz,gallery_urls jsonb,
        lifecycle_status text default 'active',publish_status text default 'published',is_hidden boolean default false,
        badges text[] default '{}',available_from date,search_public_address_text text,search_address_text text,link_zalo text,zalo_phone text,chinh_sach text);
      create table room_details(${detail});
      create table admin_users(user_id uuid primary key,phone text,full_name text);
      create table room_media(id uuid,room_id uuid,type text,url text,is_cover bool,sort_order int,created_at timestamptz);
      create index on room_media(room_id);`);
    for (const f of schema.functions) await db.exec(f.definition);
    await db.exec(`create view public.room_full_public as ${schema.view}`);
    const migration = fs.readdirSync("supabase/migrations").find(name => name.endsWith("_room_recommendations.sql"))!;
    await db.exec(fs.readFileSync(path.join("supabase/migrations", migration), "utf8"));
    const v2Migration=fs.readdirSync("supabase/migrations").find(name=>name.endsWith("_room_recommendations_final_page_exclusion.sql"))!;
    await db.exec(fs.readFileSync(path.join("supabase/migrations",v2Migration),"utf8"));
    const near = randomUUID(), far = randomUUID(), missing = randomUUID(), unapproved = randomUUID();
    for (const [id,lat,lng,approval] of [[near,10.7626,106.6819,"approved"],[far,10.8626,106.7819,"approved"],[missing,null,null,"approved"],[unapproved,10.7626,106.6819,"pending"]]) {
      await db.query("insert into properties values($1,'P','Fixture',$4,'active',$2,$3)",[id,lat,lng,approval]);
    }
    const ids: Record<string,string> = {};
    async function add(name:string, property=near, price=7e6, district="Quận 1", updated="2026-11-03T10:00:00Z", extra:Record<string,unknown>={}) {
      const id=randomUUID();ids[name]=id;
      await db.query(`insert into rooms(id,property_id,room_code,room_type,house_number,address,ward,district,price,status,description,created_at,updated_at,search_public_address_text,link_zalo,zalo_phone,chinh_sach)
        values($1,$2,$3,'Studio','257/17','Phan Xích Long','Đức Nhuận',$4,$5,'Đang trống','Nội thất đẹp','2026-01-01',$6,'phan xích long đức nhuận','secret-link','secret-phone','secret-policy')`,[id,property,name,district,price,updated]);
      await db.query("insert into room_details(room_id,has_window,has_balcony,has_elevator,allow_cat,short_term,other_amenities,detail_json) values($1,true,true,true,true,true,'Sân thượng','{\"private\":\"secret\"}')",[id]);
      for (const [column,value] of Object.entries(extra)) await db.query(`update rooms set ${column}=$2 where id=$1`,[id,value]);
      return id;
    }
    await add("old",near,5e6,"Quận 1","2026-10-01");
    await add("new",near,9e6,"Quận 1","2026-11-03T12:00:00Z");
    await add("cheap",near,4_999_999);await add("expensive",near,9_000_001);
    await add("noGPS",missing,6e6,"Quận 1","2026-11-03T13:00:00Z");
    await add("far",far,6e6);await add("district3",missing,7e6,"Quận 3");
    await add("rented",near,6e6,"Quận 1",undefined,{status:"Đã thuê"});
    await add("private",near,6e6,"Quận 1",undefined,{publish_status:"draft"});
    await add("hidden",near,6e6,"Quận 1",undefined,{is_hidden:true});
    await add("archived",near,6e6,"Quận 1",undefined,{lifecycle_status:"archived"});
    await add("unapproved",unapproved);
    await add("missingTimestamp",near,6e6,"Quận 1",undefined,{updated_at:null});
    type Params = Record<string,unknown>;
    async function fetch(p:Params={}) {
      const result = await db.query(`select fetch_room_recommendations_v1(
        p_min_price=>$1,p_max_price=>$2,p_districts=>$3,p_center_lat=>$4,p_center_lng=>$5,p_exclude_ids=>$6,
        p_features=>$7,p_statuses=>$8,p_search=>$9,p_move=>$10,p_pet_policies=>$11,p_contract_terms=>$12,p_room_types=>$13,p_badge=>$14) as data`,
        [p.min??null,p.max??null,p.districts??[],p.lat??null,p.lng??null,p.exclude??[],p.features??[],p.statuses??["Đang trống","Sắp trống"],p.search??null,p.move??null,p.pets??[],p.terms??[],p.types??[],p.badge??null]);
      return result.rows[0].data as Array<Record<string,any>>;
    }
    const price = await fetch({min:5e6,max:9e6,districts:["Quận 1"]});
    assert(price.some(r=>r.id===ids.old));assert(price.some(r=>r.id===ids.new));
    assert(!price.some(r=>[ids.cheap,ids.expensive].includes(r.id)),"5–7 recommendation is 5–9, never below 5");
    assert(price.some(r=>r.id===ids.noGPS),"missing GPS remains eligible for selected district");
    assert(price.every(r=>r.district==="Quận 1"));
    for (let i=1;i<price.length;i++) {
      assert(new Date(price[i-1].updated_at).getTime()>=new Date(price[i].updated_at).getTime(),"newest first regardless of price/GPS");
      if(price[i-1].updated_at===price[i].updated_at)assert(String(price[i-1].id)>String(price[i].id),"ID tie break");
    }
    for(const name of ["private","hidden","archived","unapproved","rented"])assert(!price.some(r=>r.id===ids[name]),name+" excluded");
    const scoped=await fetch({lat:10.7626,lng:106.6819});
    assert(scoped.every(r=>typeof r.distance_km==="number"&&r.distance_km<=3));
    assert(!scoped.some(r=>[ids.far,ids.noGPS,ids.district3].includes(r.id)));
    const radiusAndDistrict=await fetch({lat:10.7626,lng:106.6819,districts:["Quận 1"]});
    assert(radiusAndDistrict.some(r=>r.id===ids.noGPS&&r.distance_km===null));
    assert(!radiusAndDistrict.some(r=>r.id===ids.far),"known GPS outside 3km is excluded even in the selected district");
    assert((await fetch({districts:["Quận 3"]})).some(r=>r.id===ids.district3));
    const excluded=await fetch({exclude:[ids.new,ids.noGPS]});assert(!excluded.some(r=>[ids.new,ids.noGPS].includes(r.id)));
    assert.equal(new Set(excluded.map(r=>r.id)).size,excluded.length);
    const amenities=await fetch({features:["window","balcony"],move:"elevator",pets:["cat"],terms:["short"],types:["Studio"]});assert(amenities.length>0);
    await db.query("update room_details set has_window=false where room_id=$1",[ids.new]);
    assert(!(await fetch({features:["window"]})).some(r=>r.id===ids.new));
    assert.equal((await fetch({types:["1PN"]})).length,0);assert.equal((await fetch({badge:"exclusive"})).length,0);
    assert((await fetch({statuses:["Đã thuê"]})).every(r=>r.status==="Đã thuê"));
    assert((await fetch({search:"257/17 Phan Xích Long"})).length>0);
    assert.equal((await fetch({search:"257/17"})).length,0);assert.equal((await fetch({search:"quận 3"}))[0].id,ids.district3);
    const publicRow=price[0];assert.equal("link_zalo" in publicRow,false);assert.equal("zalo_phone" in publicRow,false);assert.equal("owner_id" in publicRow,false);
    assert.equal("detail_json" in publicRow.room_detail,false);assert.notEqual(publicRow.house_number,"257/17");
    await db.query("insert into room_media values($1,$2,'image','https://fixture/image.jpg',true,0,now())",[randomUUID(),ids.new]);
    const media=(await fetch({search:"phòng new"}))[0];assert.deepEqual(media.image_urls,["https://fixture/image.jpg"]);assert.equal(media.image_count,1);
    await db.exec("grant usage on schema public,extensions to service_role;grant select on all tables in schema public to service_role;alter table rooms enable row level security;set role service_role;");
    assert((await fetch({min:5e6,max:9e6})).length>0);
    await db.exec("reset role;set role anon");await assert.rejects(()=>fetch(),/permission denied/);await db.exec("reset role");
    // All 50 matches must be excluded, even when only the last 20 IDs are sent.
    const matching:string[]=[];
    for(let n=0;n<50;n++)matching.push(await add('MATCH-'+n,near,6e6,'Quận 7'));
    for(let n=0;n<25;n++)await add('EXTRA-'+n,near,8e6,'Quận 7');
    const mainFilters={search:null,includeHouse:false,minPrice:5e6 as number|null,maxPrice:7e6 as number|null,districts:['Quận 7'],roomTypes:[],move:null,petPolicies:[],contractTerms:[],statuses:[]};
    const v2=async(main=mainFilters)=> (await db.query(`select fetch_room_recommendations_v2(p_min_price=>5000000,p_max_price=>9000000,p_districts=>array['Quận 7'],p_exclude_ids=>$1,p_main_filters=>$2::jsonb) as data`,[matching.slice(30),JSON.stringify(main)])).rows[0].data as Array<{id:string;price:number}>;
    const outside=await v2();assert.equal(outside.length,20);assert(outside.every(row=>!matching.includes(row.id)&&Number(row.price)===8e6));
    assert.equal((await v2({...mainFilters,maxPrice:9e6})).length,0,'all candidate prices already match the original filter');
    assert.equal((await v2({...mainFilters,minPrice:null,maxPrice:null})).length,0,'district-only results must not reappear as recommendations');
    const aliasId=await add('ALIAS',near,6e6,'7');
    const aliasResult=(await db.query(`select fetch_room_recommendations_v2(p_min_price=>5000000,p_max_price=>7000000,p_districts=>array['Quận 7','7'],p_main_filters=>$1::jsonb) as data`,[JSON.stringify(mainFilters)])).rows[0].data;
    assert.deepEqual(aliasResult.map((row:{id:string})=>row.id),[aliasId],'original district aliases must not be broadened when testing membership');
    await db.exec("update rooms set search_address_text=public.norm_room_search_text(concat_ws(' ',house_number,address,ward,district))");
    const privateMiss=(await db.query(`select fetch_room_recommendations_v2(p_min_price=>5000000,p_max_price=>7000000,p_districts=>array['Quận 7'],p_main_filters=>$1::jsonb) as data`,[JSON.stringify({...mainFilters,search:'999/1 Phan Xích Long',includeHouse:true})])).rows[0].data;
    assert.equal(privateMiss.length,0,'Home fuzzy admin address matching still includes this street; those matches must remain excluded');
    await db.exec('set role anon');await assert.rejects(()=>v2(),/permission denied/);await db.exec('reset role');
    console.log('Recommendation v2: 50 full-filter matches excluded before LIMIT, 20 outside matches, no-price filter, service-only permissions PASS');
    // Query shape at the requested scale, using disposable PostgreSQL only.
    await db.query(`insert into rooms(id,property_id,room_code,room_type,price,status,address,district,created_at,updated_at,search_public_address_text)
      select gen_random_uuid(),$1,'LOAD-'||n,'Studio',6000000,'Đang trống','Phan Xích Long','Quận 1',now(),now()-n*interval '1 second','phan xích long'
      from generate_series(1,15000) n`,[near]);
    const start=performance.now();const bounded=await fetch({min:5e6,max:9e6,districts:["Quận 1"]});
    assert.equal(bounded.length,10);console.log(`Disposable PostgreSQL: public eligibility, prices, all filters, 3km/GPS fallback, ordering, dedupe, media, RPC permissions PASS; 15k sample ${Math.round(performance.now()-start)}ms (local, not production benchmark)`);
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error.message,error.where||"");process.exitCode=1;});
