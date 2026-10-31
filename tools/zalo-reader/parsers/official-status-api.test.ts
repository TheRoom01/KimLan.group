import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as statusService from "../../../lib/zalo-reader/status-service";
import { OFFICIAL_ZALO_GROUPS } from "../../../lib/zalo-reader/official";
import { randomUUID } from "node:crypto";
async function main() {
 const old=process.env.ZALO_READER_INTERNAL_SECRET;process.env.ZALO_READER_INTERNAL_SECRET="offline-status";
 let authorized=true,level=1,reads=0;const writes:any[]=[];
 const db={rpc:async(name:string,args:any)=>{writes.push({name,args});return{data:true,error:null};}};
 const dependencies:any={"next/server":{NextResponse:{json:(body:any,options:any)=>Response.json(body,options)}},
  "@/lib/supabase/admin":{createSupabaseAdminClient:()=>{reads++;return db;}},
  "@/lib/supabase/server":{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:authorized?{id:"fixture"}:null},error:null})},rpc:async()=>({data:level,error:null})})},
  "@/lib/zalo-reader/status-service":{...statusService,readReaderStatus:async()=>[{group_key:OFFICIAL_ZALO_GROUPS[0].key,health:{state:"waiting",stale:true}}]}};
 const load=(file:string)=>{const module={exports:{}as any};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:(name:string)=>{assert.ok(name in dependencies);return dependencies[name];}});return module.exports;};
 const internal=load("app/api/internal/zalo-reader/status/route.ts");
 const admin=load("app/api/admin/zalo-reader/status/route.ts");
 const group=OFFICIAL_ZALO_GROUPS[0];const now=new Date().toISOString();
 const body={runId:randomUUID(),groupKey:group.key,groupName:group.name,groupId:group.groupId,mode:"official",status:"running",startedAt:now,heartbeatAt:now,windowFrom:now,windowTo:now,counters:{new_rooms:1,cookie:"must-not-persist"},sourceUrl:"https://private.test/?token=secret"};
 const request=(data:any,secret="offline-status")=>new Request("http://offline/status",{method:"POST",headers:{"Content-Type":"application/json","x-internal-secret":secret},body:JSON.stringify(data)});
 assert.equal((await internal.POST(request(body,"bad"))).status,401);assert.equal(reads,0);
 assert.equal((await internal.POST(request(body))).status,200);
 assert.equal(writes[0].name,"report_zalo_reader_status_v1");
 assert.doesNotMatch(JSON.stringify(writes),/private\.test|secret|cookie|must-not-persist/);
 assert.equal((await internal.POST(request({...body,groupName:"outside"}))).status,503);
 assert.equal(writes.length,1);
 authorized=false;assert.equal((await admin.GET()).status,401);
 authorized=true;level=0;assert.equal((await admin.GET()).status,403);
 level=2;assert.equal((await admin.GET()).status,200);
 if(old===undefined)delete process.env.ZALO_READER_INTERNAL_SECRET;else process.env.ZALO_READER_INTERNAL_SECRET=old;
 console.log("Reader status HTTP auth / L1-L2 / allowlist / diagnostic redaction: PASS");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
