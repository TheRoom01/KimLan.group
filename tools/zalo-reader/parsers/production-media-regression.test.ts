import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { inspectImageSource,waitForStableMedia } from "../media-readiness";
import { importLifecycle,importLifecycleLabel,importMediaStatus } from "../../../lib/zalo-import/lifecycle";
import { buildSemanticTimelineRooms } from "./index";
import { parseZaloRoomText } from "../../../lib/zalo-import/parser";
import { normalizedRoomIdentity,classifyRoomIdentity,canonicalStoredIdentity,selectedUpdatePatch,snapshotRoom } from "../../../lib/zalo-import/room-comparison";
import { normalizedStreetKey } from "../../../lib/rooms/street";
import { extractAddressKey } from "./utils";
import { existingOfficialReceipt,officialSourceIdentity } from "../../../lib/zalo-reader/official-request";
import { randomUUID } from "node:crypto";

async function main(){
 const aliases=["3 Tháng 2","3/2","Đường 3 Tháng 2","Đường 3/2","Ba Tháng Hai","Đường Ba Tháng Hai"];
 const old={id:"main",house_number:"458/50",address:"Ba Tháng Hai",district:"Quận 10",room_code:"103",price:5000000};
 for(const address of aliases){
  assert.equal(extractAddressKey(`458/50 ${address}, Q10`),"458/50|3 thang 2|10",address);
  const parsed=parseZaloRoomText(`458/50 ${address}, Q10\nStudio/CS - 5.900.000 - P.103 - trống 3/2`);
  assert.equal(parsed.roomPayload.house_number,"458/50",address);
  assert.ok(parsed.roomPayload.address.includes(address.replace(/^Đường /,"")),"display keeps the source street variant");
  assert.equal(normalizedStreetKey(parsed.roomPayload.address),"3 thang 2",address);
  assert.equal(normalizedRoomIdentity(parsed.roomPayload),normalizedRoomIdentity(old),address);
  assert.equal(classifyRoomIdentity({...parsed.roomPayload,price:5900000,room_type:"2PN",images:["new"]},[old]).type,"UPDATE",address);
  assert.equal(classifyRoomIdentity(parsed.roomPayload,[],[{id:"pending",status:"Chờ duyệt",room_payload:old}]).type,"NEEDS_REVIEW");
 }
 for(const patch of [{house_number:"458/51"},{room_code:"3/2"},{district:"Quận 3"}])assert.notEqual(normalizedRoomIdentity({...old,...patch}),normalizedRoomIdentity(old));
 assert.equal(old.address,"Ba Tháng Hai");
 const legacyKey=JSON.stringify(["458/50","ba thang hai","10","103"]);
 assert.equal(canonicalStoredIdentity(legacyKey),normalizedRoomIdentity(old));
 const legacyReview={version:1,type:"UPDATE",identity_key:legacyKey,snapshot:snapshotRoom(old,{},[]),presence:{"room.price":"value"},uncertain_fields:[]};
 const pending={...old,price:5900000,_room_import:legacyReview};
 assert.equal(selectedUpdatePatch(pending,{},["room.price"]).room.price,5900000);
 assert.equal(pending._room_import.identity_key,legacyKey,"read compatibility never rewrites existing Pending keys");
 const identity=officialSourceIdentity({groupName:"Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠",groupId:"g1986619726266954037",sourceMessageId:"old-source",sourceRoomKey:normalizedRoomIdentity(old)!,trial:true,runId:randomUUID(),verified:true},old);
 const batch={id:"legacy-test-batch",parser_result:{test_import:true,room_payload:old,official_source:{trial:true,group_id:identity.metadata.group_id}}};
 const before=JSON.stringify(batch);
 const db={from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:"old-test-pending",status:"Chờ duyệt"}}),then:(resolve:any)=>resolve({data:table==="zalo_import_batches"?[batch]:[]})};return q;}};
 const receipt=await existingOfficialReceipt(db,identity,"Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠",{...old,address:"Đường 3/2"});
 assert.equal(receipt!.pendingVersionId,"old-test-pending");assert.equal(receipt!.duplicate,true);assert.equal(JSON.stringify(batch),before);
 assert.equal(JSON.parse(normalizedRoomIdentity({...old,room_code:"3/2"})!)[3],"3/2");
 assert.equal(importLifecycle({room_payload:{is_test_import:true},status:"Chờ duyệt"}),"TEST");
 assert.equal(importLifecycle({batch:{parser_result:{test_import:true}},status:"Chờ duyệt"}),"TEST");
 assert.equal(importLifecycle({batch:{parser_result:{official_source:{trial:true}}}}),"TEST");
 assert.equal(importLifecycle({room_payload:{_reader_manual_review:true},status:"Chờ duyệt"}),"PRODUCTION_PENDING");
 assert.equal(importLifecycle({status:"Đã duyệt",approved_room_id:"main"}),"PUBLISHED");
 assert.match(importLifecycleLabel({status:"Chờ duyệt"}),/CHÍNH THỨC/);
 assert.equal(importMediaStatus({images:[{}]}),"MEDIA_UNVERIFIED");
 assert.equal(importMediaStatus({images:[{}],room_payload:{import_diagnostics:{album_expected_images:3,media_verification:"VERIFIED"}}}),"MEDIA_INCOMPLETE");
 const image=(src:string,complete=true,width=400,attrs:Record<string,string>={})=>({currentSrc:src,complete,naturalWidth:width,naturalHeight:width,className:"",getAttribute:(key:string)=>attrs[key]||null}) as any;
 assert.equal(inspectImageSource(image("https://example.test/placeholder.gif")).usableForRoom,false);
 assert.equal(inspectImageSource(image("blob:legitimate",false,0)).loaded,false);
 assert.equal(inspectImageSource(image("https://example.test/thumb.jpg")).quality,"thumbnail");
 assert.equal(inspectImageSource(image("https://example.test/thumb.jpg",true,200,{"data-original-src":"https://example.test/original.jpg"})).url,"https://example.test/original.jpg");
 assert.equal(inspectImageSource(image("blob:room")).usableForRoom,true);
 let clock=0,retries=0,captures=0;
 const settled=await waitForStableMedia({now:()=>clock,quietMs:400,timeoutMs:2000,wait:async ms=>{clock+=ms;},capture:async()=>{
  captures++;return [{idCandidates:["image"],mediaPendingCount:clock<600?1:0,images:clock<600?[]:[{url:"blob:ready",loaded:true}]}];
 },retry:async()=>{retries++;}});
 assert.equal(settled.timedOut,false);assert.ok(clock>=1000,"does not advance until lazy media settles");assert.ok(captures>3);assert.equal(retries,0);
 clock=0;
 const timeout=await waitForStableMedia({now:()=>clock,quietMs:200,timeoutMs:400,wait:async ms=>{clock+=ms;},capture:async()=>[{idCandidates:["slow"],images:[],mediaPendingCount:1}],retry:async()=>{retries++;}});
 assert.equal(timeout.timedOut,true);assert.equal(retries,1);assert.ok(timeout.items[0].mediaWarnings?.includes("MEDIA_LOADING_TIMEOUT"));
 // Execute the existing Reader's exact image-association loop, not a second parser.
 const ast=ts.createSourceFile("reader.ts",fs.readFileSync("tools/zalo-reader/zalo-reader.before-semantic-parser.ts","utf8"),ts.ScriptTarget.Latest,true);
 let loop="",helpers="";
 const visit=(node:ts.Node)=>{if(ts.isForOfStatement(node)&&node.expression.getText(ast)==="domImages"&&node.getText(ast).includes("imageTargets"))loop=node.getText(ast);
  if(ts.isFunctionDeclaration(node)&&["isBlankImageMessage","markDomSource"].includes(node.name?.text||""))helpers+=node.getText(ast)+"\n";ts.forEachChild(node,visit);};visit(ast);assert.ok(loop);
 const messages=[{msgId:"photo",msgType:2,kind:"image",imageUrls:[],fromUid:"fixture",sendDttm:3000,serverTime:3000}];
 const context=vm.createContext({messages,domImages:[1,2,3].map(i=>({url:`https://example.test/${i}.jpg`,idCandidates:["photo"],usableForRoom:true})),
  domItem:{order:1,idCandidates:["photo"],albumExpectedCount:3},messageByAnyId:new Map([["photo",messages[0]]]),assignedImageMessages:new Set(),assignedDomImageUrls:new Set(),
  domHydration:{directMatchCount:0,decodedImageCount:0},itemMatched:false});
 vm.runInContext(ts.transpileModule(`${helpers}\n${loop}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(messages[0].imageUrls.length,3,"all images sharing a verified message ID survive hydration");
 const text=(id:string,value:string,time:number)=>({msgId:id,cliMsgId:id,msgType:1,kind:"text",text:value,sendDttm:time,serverTime:time,fromUid:"fixture",senderName:"Fixture",imageUrls:[],videoUrls:[],videoThumbUrls:[],groupLayoutId:null,imageIndex:null,totalImages:null}) as any;
 const photo={...text("photo","",3000),...messages[0],originMsgType:"chat.photo",totalImages:3};
 const previews=buildSemanticTimelineRooms({groupName:"Fixture",groupId:"g-fixture",messages:[text("building","458/50 Ba Tháng Hai, Q10",1000),text("anchor","Studio/CS - 5.900.000 - P.103 - trống",2000),photo]});
 assert.equal(previews.length,1);assert.equal(previews[0].imageUrls.length,3);assert.equal(previews[0].albums[0].complete,true);
 const unknown=buildSemanticTimelineRooms({groupName:"Fixture",groupId:"g-fixture",messages:[text("building","458/50 Ba Tháng Hai, Q10",1000),text("anchor","Studio/CS - 5.900.000 - P.103 - trống",2000),{...photo,totalImages:null}]});
 assert.equal(unknown[0].albums[0].complete,false);assert.ok(unknown[0].warnings.includes("MEDIA_UNVERIFIED"));
 console.log("Production lifecycle / 3 Tháng 2 aliases / adaptive lazy loading / placeholders / same-message album / uncertain completeness: PASS (offline)");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
