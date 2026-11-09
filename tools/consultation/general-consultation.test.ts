import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as consultation from "../../lib/consultation";

const { PGlite } = createRequire(path.resolve("package.json"))(path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.admin_users(user_id uuid primary key, level int);
      create function public.get_my_admin_level() returns int language sql stable security definer as $$ select level from public.admin_users where user_id=auth.uid() $$;
      create table public.properties(id uuid primary key);
      create table public.property_members(property_id uuid,user_id uuid,status text,role text,created_at timestamptz default now());
      create table public.rooms(id uuid primary key, property_id uuid, owner_id uuid, room_code text,room_type text,
        house_number text,address text,ward text,district text,price bigint,is_hidden boolean,lifecycle_status text,publish_status text);
      create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,type text,title text,message text,reference_id uuid,reference_type text);
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant select on property_members to authenticated;
    `);
    await db.exec(fs.readFileSync("supabase/migrations/20261024120000_room_consult_requests.sql", "utf8"));
    const admin = randomUUID(), staff = randomUUID(), otherStaff = randomUUID(), room = randomUUID();
    await db.query("insert into auth.users values($1),($2),($3)", [admin,staff,otherStaff]);
    await db.query("insert into admin_users values($1,1),($2,2),($3,2)", [admin,staff,otherStaff]);
    await db.query("insert into rooms(id,owner_id,room_code,room_type,price,is_hidden,lifecycle_status,publish_status) values($1,$2,'R101','Studio',6000000,false,'active','published')", [room,staff]);
    // An existing request is present before the new schema is installed.
    const old = await db.query("select * from submit_room_consult_request_v1($1,$2,'Khách cũ','0912345678','consultation')", [randomUUID(),room]);
    await db.exec(fs.readFileSync("supabase/migrations/20261103155254_general_consultation_requests.sql", "utf8"));
    await db.exec(fs.readFileSync("supabase/migrations/20261103155254_general_consultation_requests.sql", "utf8"));
    const preserved = (await db.query("select consultation_kind,room_id from room_consult_requests where id=$1", [old.rows[0].request_id])).rows[0];
    assert.equal(preserved.consultation_kind,"room_consultation"); assert.equal(preserved.room_id,room);

    let captcha = true, rpcCalls = 0;
    const pushes: { origin: string; event: { type: string; id: string } }[] = [];
    const afterResponse: (() => Promise<void>)[] = [];
    const deps: Record<string, unknown> = {
      "next/server": { after: (callback: () => Promise<void>) => afterResponse.push(callback) },
      "@/lib/notifications/webPush": {
        pushConfig: () => ({ publicKey: "test" }),
        sendEventPush: async (origin: string, event: { type: string; id: string }) => { pushes.push({ origin, event }); },
      },
      "@/lib/consultation": consultation,
      "@/lib/api/response": {
        apiError: (code:string,message:string,status:number) => Response.json({ok:false,error:{code,message}},{status}),
        apiSuccess: (data:unknown,status=200) => Response.json({ok:true,data},{status}),
      },
      "@/lib/owner/registrationSecurity": {getRegistrationClientIp:()=>"127.0.0.1",verifyTurnstileToken:async()=>captcha},
      "@/lib/supabase/admin": {createSupabaseAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
        rpcCalls++;
        const keys=Object.keys(args),values=Object.values(args);
        try {const result=await db.query(`select * from public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(",")})`,values);return{data:result.rows,error:null};}
        catch(error){return{data:null,error};}
      }})},
    };
    const module={exports:{} as {POST:(request:Request)=>Promise<Response>}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/room-consult-requests/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {module,exports:module.exports,require:(name:string)=>{assert.ok(name in deps,name);return deps[name];},URL,Intl,Date,console});
    const post=(body:Record<string,unknown>)=>module.exports.POST(new Request("http://localhost:3000/api/room-consult-requests",{method:"POST",headers:{origin:"http://localhost:3000"},body:JSON.stringify(body)}));
    const base={request_key:randomUUID(),consultation_kind:"general_consultation",room_id:null,guest_name:"Khách mới",guest_phone:"0901234567",request_type:"consultation",notes:"Quận 3, ngân sách 6 triệu",captcha_token:"test"};
    for(const [i,source] of consultation.REFERRAL_SOURCES.entries()){
      const response=await post({...base,request_key:randomUUID(),guest_phone:`090123456${i}`,referral_source:source,referral_detail:"Nhóm tìm phòng SG"});
      assert.equal(response.status,201,await response.clone().text());
      const result=await response.json();
      const row=(await db.query("select * from room_consult_requests where id=$1",[result.data.request_id])).rows[0];
      assert.equal(row.room_id,null);assert.equal(row.room_code_snapshot,null);assert.equal(row.consultation_kind,"general_consultation");
      assert.equal(row.referral_source,source);assert.equal(row.referral_detail,"Nhóm tìm phòng SG");assert.equal(row.status,"new");
    }
    const first=await post(base),second=await post(base);
    assert.equal(first.status,201);assert.equal(second.status,200);assert.equal((await second.json()).data.duplicate,true);
    const count=(await db.query("select count(*)::int n from room_consult_requests where request_key=$1",[base.request_key])).rows[0].n;
    assert.equal(count,1,"repeated submission stores exactly one request");
    for(const patch of [{guest_name:""},{guest_phone:"123456789"},{guest_phone:""},{room_id:room},{referral_source:"Invalid"},{referral_detail:"x".repeat(301)},{request_type:"viewing"}]){
      const before=rpcCalls;assert.equal((await post({...base,...patch})).status,400);assert.equal(rpcCalls,before);
    }
    captcha=false;assert.equal((await post({...base,request_key:randomUUID()})).status,400);captcha=true;
    assert.equal(afterResponse.length, 0, "general consultations do not enqueue push");
    const viewingInput = {...base,request_key:randomUUID(),consultation_kind:"room_consultation",room_id:room,request_type:"viewing",viewing_date:"2099-12-01",preferred_time:"Sáng (08:00–12:00)"};
    const viewing = await post(viewingInput);
    assert.equal((await post(viewingInput)).status, 200);
    assert.equal(afterResponse.length, 1, "a repeated room request only enqueues one push");
    assert.equal(viewing.status,201,await viewing.clone().text());
    const viewingId = (await viewing.json()).data.request_id;
    await afterResponse[0]();
    assert.equal(pushes[0].origin, "http://localhost:3000");
    assert.equal(pushes[0].event.type, "room_consult_request");
    assert.equal(pushes[0].event.id, viewingId);
    const viewingRow=(await db.query("select room_id,request_type from room_consult_requests where id=$1",[viewingId])).rows[0];
    assert.equal(viewingRow.room_id,room);assert.equal(viewingRow.request_type,"viewing");
    // Force 10 requests in the last hour, outside the 2-minute duplicate window.
    await db.query("insert into room_consult_requests(request_key,room_id,room_code_snapshot,guest_name,guest_phone,guest_phone_normalized,request_type,created_at) select gen_random_uuid(),$1,'R101','Rate test','0988888888','0988888888','consultation',now()-interval '5 minutes' from generate_series(1,10)",[room]);
    assert.equal((await post({...base,request_key:randomUUID(),guest_phone:"0988888888"})).status,429);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from room_consult_requests"),/permission denied/);
    await assert.rejects(db.query("select * from submit_general_consult_request_v1($1,'Khách test','0999999999')",[randomUUID()]),/permission denied/);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherStaff]);
    assert.equal((await db.query("select count(*)::int n from room_consult_requests")).rows[0].n,0,"unassigned L2 cannot read other customers");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
    assert.ok((await db.query("select count(*)::int n from room_consult_requests where consultation_kind='general_consultation'")).rows[0].n>0,"L1 can manage general requests");
    await db.exec("reset role");
    console.log("Consultation API + PostgreSQL: 5 sources, free-text source, validation, CAPTCHA, dedup, rate limit, NULL room, old records/viewing, L1/L2/anon RLS PASS");
  }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
