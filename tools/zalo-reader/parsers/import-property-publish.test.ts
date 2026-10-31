import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { getImportReview } from "../../../lib/zalo-import/room-comparison";
import * as comparison from "../../../lib/zalo-import/room-comparison";
import { zaloImportErrorMessage } from "../../../lib/zalo-import/error-message";

async function main(){
  const tables:Record<string,any[]>={rooms:[],room_details:[],room_media:[],pending_room_versions:[],zalo_import_batches:[],zalo_import_images:[],zalo_import_videos:[]};
  class Query {
    filters:Array<(row:any)=>boolean>=[];op="select";payload:any;
    constructor(readonly table:string){}
    select(){return this}eq(key:string,value:any){this.filters.push(row=>row[key]===value);return this}order(){return this}
    insert(value:any){assert.notEqual(this.table,"rooms","manual Imports must use admin_upsert_room_v3, never raw INSERT");this.op="insert";this.payload=value;return this}
    update(value:any){this.op="update";this.payload=value;return this}delete(){this.op="delete";return this}
    result(single=false){let rows=tables[this.table].filter(row=>this.filters.every(test=>test(row)));
      if(this.op==="insert"){rows=(Array.isArray(this.payload)?this.payload:[this.payload]).map(row=>({selected:true,...row}));tables[this.table].push(...rows)}
      if(this.op==="update")rows.forEach(row=>Object.assign(row,this.payload));
      if(this.op==="delete")tables[this.table]=tables[this.table].filter(row=>!rows.includes(row));
      return{data:single?rows[0]:rows,error:null};}
    maybeSingle(){return Promise.resolve(this.result(true))}single(){return Promise.resolve(this.result(true))}
    then(resolve:any,reject:any){return Promise.resolve(this.result()).then(resolve,reject)}
  }
  const db={from:(table:string)=>new Query(table)};let rpcCalls=0;let ambiguous=false;let statusError=false;
  const actor={rpc:async(name:string,args:any)=>{
    assert.equal(name,"admin_upsert_room_v3");rpcCalls++;
    if(statusError)return{data:null,error:{code:"23514",message:'new row for relation "rooms" violates check constraint "rooms_status_check"'}};
    assert.ok(['Đang trống','Sắp trống','Đã thuê'].includes(args.p_payload.status),'publisher must respect rooms_status_check');
    if(ambiguous && !args.p_payload.property_id)return{data:null,error:{message:"PROPERTY_MATCH_REQUIRED",code:"P0001"}};
    const row={...args.p_payload,id:args.p_room_id,property_id:args.p_payload.property_id||"matched-building"};tables.rooms.push(row);return{data:row,error:null};
  }};
  const loaded={exports:{} as any};
  const deps:Record<string,any>={crypto,"./room-comparison":{getImportReview},"./resolve":{resolveZaloImportRoom:async()=>({roomPayload:{_room_import:{type:"CREATE"}}})},
    "@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"@/lib/r2/zalo-temp":{
      makeRoomImageKey:(room:string,id:string)=>`rooms/${room}/images/${id}.webp`,
      copyR2Object:async({toKey}:any)=>({key:toKey,url:`https://example.test/${toKey}`}),deleteR2Keys:async()=>0,
    }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/zalo-import/publish-pending-room.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,require:(name:string)=>{assert.ok(name in deps,name);return deps[name]},console});
  function reset(property_id?:string){for(const key of Object.keys(tables))tables[key]=[];
    const batch={id:"batch",status:"Chờ duyệt",parser_result:{official_source:{trial:false}}};tables.zalo_import_batches.push(batch);
    tables.pending_room_versions.push({id:"pending",batch_id:"batch",status:"Chờ duyệt",batch,room_payload:{room_code:"503",room_type:"2PN",house_number:"100/2A2",address:"Trần Hưng Đạo",district:"Quận 1",price:16_000_000,status:"Trống",_reader_manual_review:true,...(property_id?{property_id}:{})},detail_payload:{}});
    tables.zalo_import_videos.push({id:"video",batch_id:"batch",selected:true,temp_r2_key:"rooms/zalo-pending-pending/videos/manual.mp4",mime_type:"video/mp4"});
  }
  const publish=()=>loaded.exports.publishPendingRoom({pendingId:"pending",actorUserId:"admin",source:"manual",supabase:db,actorSupabase:actor});
  reset();const first=await publish();assert.equal(first.videoCount,1);assert.equal(first.imageCount,0);
  assert.equal(tables.rooms[0].property_id,"matched-building");assert.equal(tables.pending_room_versions[0].status,"Đã duyệt");
  assert.equal(tables.pending_room_versions[0].room_payload.property_id,"matched-building");
  assert.equal(tables.room_media[0].type,"video");
  assert.equal(tables.rooms[0].status,"Đang trống","legacy Trống becomes the official room status");
  for(const status of ['Đang trống','Sắp trống','Đã thuê']){reset();tables.pending_room_versions[0].room_payload.status=status;await publish();assert.equal(tables.rooms[0].status,status,'preserve official statuses');}
  reset("chosen-building");ambiguous=true;await publish();assert.equal(tables.rooms[0].property_id,"chosen-building","explicit selection is forwarded to the same admin RPC");
  reset();const before=rpcCalls;await assert.rejects(publish,error=>(error as any).message==="PROPERTY_MATCH_REQUIRED");assert.equal(rpcCalls,before+1);assert.equal(tables.rooms.length,0);assert.equal(tables.pending_room_versions[0].status,"Chờ duyệt");
  reset();tables.zalo_import_videos=[];tables.pending_room_versions[0].room_payload._manual_video_required=true;const beforeEmpty=rpcCalls;
  await assert.rejects(publish,/thêm video thủ công/);assert.equal(rpcCalls,beforeEmpty,"missing-video draft never creates a main room/building");assert.equal(tables.rooms.length,0);
  const draftModule={exports:{} as any};
  const draftDeps={...deps,"@/lib/zalo-import/room-comparison":comparison,
    "@/lib/supabase/server":{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"admin"}}})},rpc:async()=>({data:2,error:null})})},
    "next/server":{NextResponse:{json:(body:any,options:any)=>Response.json(body,options)}}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/admin/zalo-imports/[id]/draft/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:draftModule,exports:draftModule.exports,require:(name:string)=>{assert.ok(name in draftDeps,name);return(draftDeps as any)[name]},console,structuredClone,process:{env:{R2_PUBLIC_BASE_URL:"https://example.test"}}});
  delete tables.pending_room_versions[0].room_payload._reader_manual_review;
  const saved=await draftModule.exports.PATCH(new Request("http://offline.test/draft",{method:"PATCH",body:JSON.stringify({manualReviewOnly:true,room_payload:{...tables.pending_room_versions[0].room_payload,property_id:"chosen-building"},detail_payload:{},images:[],videos:[],
    new_media:[{type:"video",url:"https://example.test/rooms/zalo-pending-pending/videos/manual.mp4",temp_r2_key:"rooms/zalo-pending-pending/videos/manual.mp4"}]})}),{params:Promise.resolve({id:"pending"})});
  assert.equal(saved.status,200);const draft=await saved.json();assert.equal(draft.videos.length,1);assert.equal(draft.room_payload._manual_video_required,false);
  assert.equal(draft.auto_approve_enabled,false,"manual media upload never schedules auto-publish");assert.equal(tables.rooms.length,0,"saving the draft still cannot create main-room data");
  await publish();assert.equal(tables.rooms[0].property_id,"chosen-building");assert.equal(tables.room_media[0].type,"video");
  const endpointModule={exports:{} as any};const endpointDeps={...draftDeps,
    "@/lib/zalo-import/error-message":{zaloImportErrorMessage},
    "@/lib/supabase/server":{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"admin"}}})},rpc:async(name:string,args:any)=>name==="get_my_admin_level"?{data:2,error:null}:actor.rpc(name,args)})},
    "@/lib/zalo-import/publish-pending-room":loaded.exports,
    "@/lib/zalo-import/update-pending-room":{updatePendingRoom:()=>{throw new Error("CREATE must not call UPDATE")}},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/admin/zalo-imports/[id]/approve/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:endpointModule,exports:endpointModule.exports,require:(name:string)=>{assert.ok(name in endpointDeps,name);return(endpointDeps as any)[name]},console});
  reset("chosen-building");const viaApi=await endpointModule.exports.POST(new Request("http://offline.test/approve",{method:"POST",body:JSON.stringify({mode:"create_room"})}),{params:Promise.resolve({id:"pending"})});
  assert.equal(viaApi.status,200,"actual approve endpoint forwards the authenticated admin session to the room RPC");assert.equal(tables.rooms[0].property_id,"chosen-building");
  reset("chosen-building");statusError=true;
  const invalidStatus=await endpointModule.exports.POST(new Request("http://offline.test/approve",{method:"POST",body:JSON.stringify({mode:"create_room"})}),{params:Promise.resolve({id:"pending"})});
  assert.equal(invalidStatus.status,422);assert.match((await invalidStatus.json()).error,/Trạng thái phòng không hợp lệ[\s\S]*Chỉnh sửa/);assert.equal(tables.rooms.length,0);statusError=false;
  assert.match(zaloImportErrorMessage({message:'rooms_status_check'}),/Đang trống/);
  assert.equal(zaloImportErrorMessage(new Error('Lỗi tiếng Việt có sẵn')),'Lỗi tiếng Việt có sẵn');
  reset("chosen-building");
  tables.zalo_import_images=[{id:"old-image",batch_id:"batch",selected:true,sort_order:0,temp_r2_key:"rooms/zalo-pending-pending/images/old.webp",temp_image_url:"https://example.test/old.webp"}];
  tables.zalo_import_videos[0].sort_order=1;
  const saveOrder=(body:any)=>draftModule.exports.PATCH(new Request("http://offline.test/draft",{method:"PATCH",body:JSON.stringify({manualReviewOnly:true,room_payload:{},detail_payload:{},...body})}),{params:Promise.resolve({id:"pending"})});
  const swapped=await saveOrder({images:[{id:"old-image",sort_order:1}],videos:[{id:"video",sort_order:0}]});
  assert.equal(swapped.status,200);assert.equal((await swapped.json()).changed,true,"moving a video across an image changes positions even when per-type IDs stay identical");
  assert.equal(tables.zalo_import_images[0].sort_order,1);assert.equal(tables.zalo_import_videos[0].sort_order,0);
  assert.equal(tables.pending_room_versions[0].room_payload.room_code,"503","media-only save does not change room fields");
  assert.equal(tables.pending_room_versions[0].room_payload.price,16_000_000);assert.equal(tables.pending_room_versions[0].auto_approve_enabled,false);
  const withNewImage=await saveOrder({images:[{id:"old-image",sort_order:2}],videos:[{id:"video",sort_order:1}],new_media:[{type:"image",url:"https://example.test/rooms/zalo-pending-pending/images/new.webp",temp_r2_key:"rooms/zalo-pending-pending/images/new.webp",sort_order:0}]});
  assert.equal(withNewImage.status,200);assert.equal(tables.zalo_import_images.find(row=>row.id!=="old-image").sort_order,0,"a new upload can be moved before existing media");
  await publish();assert.deepEqual(tables.room_media.map(row=>[row.type,row.sort_order]),[['image',0],['video',1],['image',2]],"publication preserves the global image/video order");
  reset("chosen-building");
  const updateRow=tables.pending_room_versions[0];updateRow.matched_room_id="main";
  updateRow.room_payload._room_import={version:1,type:"UPDATE",identity_key:comparison.normalizedRoomIdentity(updateRow.room_payload),reason:"fixture",candidate_ids:["main"],conflicting_pending_ids:[],snapshot:comparison.snapshotRoom({...updateRow.room_payload,id:"main"},null,[]),presence:{},uncertain_fields:[]};
  tables.zalo_import_videos[0].sort_order=0;
  tables.zalo_import_images=[{id:"image",batch_id:"batch",selected:true,sort_order:1,temp_r2_key:"rooms/zalo-pending-pending/images/image.webp"}];
  const updateModule={exports:{} as any};
  const updateDeps={...deps,"node:crypto":crypto,"./room-comparison":comparison};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/zalo-import/update-pending-room.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:updateModule,exports:updateModule.exports,require:(name:string)=>{assert.ok(name in updateDeps,name);return(updateDeps as any)[name]},console});
  await updateModule.exports.updatePendingRoom({supabase:{...db,rpc:async(name:string,args:any)=>{assert.equal(name,"approve_zalo_room_update_v1");assert.deepEqual(JSON.parse(JSON.stringify(args.p_media.map((row:any)=>[row.type,row.sort_order]))),[['video',0],['image',1]],"UPDATE sends mixed media in saved order to the atomic RPC");return{data:{roomId:"main"},error:null}}},pendingId:"pending",actorUserId:"admin",selectedFields:["images","videos"],expectedRoomPayload:updateRow.room_payload,expectedDetailPayload:updateRow.detail_payload});
  // Execute the existing modal's pending-property branch to verify chooser UX.
  const modalAst=ts.createSourceFile("modal.tsx",fs.readFileSync("app/admin/RoomModal/index.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let pendingPropertyBranch="";
  function visit(node:ts.Node){if(ts.isIfStatement(node)&&node.expression.getText(modalAst).startsWith("pendingRoomPayload?._room_import?.type"))pendingPropertyBranch=node.getText(modalAst);ts.forEachChild(node,visit)}visit(modalAst);assert.ok(pendingPropertyBranch);
  let choice:any[]=[];let form:any={house_number:"100/2A2",address:"Trần Hưng Đạo",district:"Quận 1"};let result:any={match_status:"matched",property_id:"matched-building"};
  const context:any={roomForm:form,roomPayload:{property_id:null},pendingRoomPayload:{_room_import:{type:"CREATE"}},
    supabase:{rpc:async(name:string)=>{assert.equal(name,"admin_resolve_property_for_room_v2");return{data:result,error:null}}},setSaving(){},setErrorMsg(){},setPropertyCandidates:(value:any[])=>{choice=value},setRoomForm:(update:any)=>{form=update(form)}};
  const execute=()=>vm.runInNewContext(ts.transpileModule(`(async()=>{${pendingPropertyBranch}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await execute();assert.equal(context.roomPayload.property_id,"matched-building");
  context.roomPayload.property_id=null;result={match_status:"ambiguous",candidates:[{id:"one"},{id:"two"}]};await execute();assert.equal(choice.length,2);assert.equal(context.roomPayload.property_id,null,"ambiguous buildings must be selected, never guessed");
  console.log("Imports manual publish: authenticated /admin RPC, matched building, selected ambiguous building, video-only upload, empty-media preflight, Vietnamese errors, canonical statuses, saved media order for CREATE/UPDATE: PASS (offline)");
}
main().catch(error=>{console.error(error);process.exitCode=1});
