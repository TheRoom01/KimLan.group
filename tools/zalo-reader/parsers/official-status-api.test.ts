import { canAccessZaloImports } from "../../../lib/zalo-import/access";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as statusService from "../../../lib/zalo-reader/status-service";
import { OFFICIAL_ZALO_GROUPS } from "../../../lib/zalo-reader/official";
import { randomUUID } from "node:crypto";
async function main() {
 const old=process.env.ZALO_READER_INTERNAL_SECRET;process.env.ZALO_READER_INTERNAL_SECRET="offline-status";
 let authorized=true,level=1,reads=0,userId="2e803047-4878-49a5-b1bc-e5d86e7f96bc";const writes:any[]=[];
 const db={rpc:async(name:string,args:any)=>{writes.push({name,args});return{data:true,error:null};}};
 const dependencies:any={"next/server":{NextResponse:{json:(body:any,options:any)=>Response.json(body,options)}},
  "@/lib/supabase/admin":{createSupabaseAdminClient:()=>{reads++;return db;}},
  "@/lib/zalo-import/access": { canAccessZaloImports },
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:authorized?{id:userId}:null},error:null})},rpc:async()=>({data:level,error:null})})},
  "@/lib/zalo-reader/status-service":{...statusService,readReaderStatus:async()=>[{group_key:OFFICIAL_ZALO_GROUPS[0].key,health:{state:"waiting",stale:true}}]}};
 const load=(file:string)=>{const module={exports:{}as any};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:(name:string)=>{assert.ok(name in dependencies);return dependencies[name];}});return module.exports;};
 const internal=load("app/api/internal/zalo-reader/status/route.ts");
 const admin=load("app/api/admin/zalo-reader/status/route.ts");
 const group=OFFICIAL_ZALO_GROUPS[0];const now=new Date().toISOString();
 const body={runId:randomUUID(),groupKey:group.key,groupName:group.name,groupId:group.groupId,mode:"official",status:"running",startedAt:now,heartbeatAt:now,windowFrom:now,windowTo:now,counters:{new_rooms:1,rooms_read:4,pending_created:2,cookie:"must-not-persist"},sourceUrl:"https://private.test/?token=secret"};
 const pendingId=randomUUID();
 const importIssues=[
   {kind:"failed",codes:["NO_USABLE_MEDIA","https://private.test"],sourceMessageId:"message-1",rawText:"must-not-persist",
    source:{kind:"message",text:"258 Hoàng Văn Thụ, Tân Bình\nMã phòng: P.202",address:"258 Hoàng Văn Thụ, Tân Bình"}},
   {kind:"partial",codes:["MEDIA_INCOMPLETE"],sourceMessageId:"message-2",pendingIds:[pendingId,"https://private.test"]},
 ];
 const request=(data:any,secret="offline-status")=>new Request("http://offline/status",{method:"POST",headers:{"Content-Type":"application/json","x-internal-secret":secret},body:JSON.stringify(data)});
 assert.equal((await internal.POST(request(body,"bad"))).status,401);assert.equal(reads,0);
 assert.equal((await internal.POST(request({...body,importIssues}))).status,200);
 assert.equal(writes[0].name,"report_zalo_reader_status_v1");
 assert.equal(writes[0].args.p_event.counters.rooms_read,4);
 assert.equal(writes[0].args.p_event.counters.pending_created,2);
 assert.deepEqual(writes[0].args.p_event.counters.import_issues,[
   {kind:"failed",codes:["NO_USABLE_MEDIA"],sourceMessageId:"message-1"},
   {kind:"partial",codes:["MEDIA_INCOMPLETE"],sourceMessageId:"message-2",pendingIds:[pendingId]},
 ]);
 assert.deepEqual(writes[0].args.p_event.import_issue_sources,{"message-1":{
   kind:"message",text:"258 Hoàng Văn Thụ, Tân Bình\nMã phòng: P.202",address:"258 Hoàng Văn Thụ, Tân Bình",
 }});
 assert.doesNotMatch(JSON.stringify(writes[0].args.p_event.counters),/Hoàng Văn Thụ/);
 assert.doesNotMatch(JSON.stringify(writes),/private\.test|secret|cookie|must-not-persist/);
 assert.equal((await internal.POST(request({...body,groupName:"outside"}))).status,503);
 assert.equal(writes.length,1);
 authorized=false;assert.equal((await admin.GET()).status,401);
 authorized=true;userId="other-admin";assert.equal((await admin.GET()).status,403);
 userId="2e803047-4878-49a5-b1bc-e5d86e7f96bc";
 authorized=true;level=0;assert.equal((await admin.GET()).status,403);
 level=2;assert.equal((await admin.GET()).status,200);
 if(old===undefined)delete process.env.ZALO_READER_INTERNAL_SECRET;else process.env.ZALO_READER_INTERNAL_SECRET=old;
 console.log("Reader status HTTP auth / L1-L2 / allowlist / diagnostic redaction: PASS");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
