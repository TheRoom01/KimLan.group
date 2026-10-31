import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import { validateProductionMode, effectiveReaderConfig, main as runner } from "../official-runner";
import { mergeCapturedImages, waitForStableMedia } from "../media-readiness";
import { selectedUpdatePatch, normalizedRoomIdentity, snapshotRoom } from "../../../lib/zalo-import/room-comparison";

async function main(){
  const configText=fs.readFileSync("tools/zalo-reader/production.config.json","utf8");
  const config=JSON.parse(configText);
  const base=JSON.parse(fs.readFileSync("tools/zalo-reader/config.json","utf8"));
  assert.equal(base.allowReimportForTesting,true,"legacy local test stays separate");
  const api=validateProductionMode(config,["--production"],{});
  for(const flag of ["allowReimportForTesting","testImportToPending","officialTrial","previewOnly","stagingOnlyImport"]){
    assert.throws(()=>validateProductionMode({...config,[flag]:true},["--production"],{}),/CONFLICT/);
  }
  for(const args of [["--production","--trial"],["--production","--fixture"]]) {
    await assert.rejects(()=>runner(args),/CONFLICT/);
  }
  assert.throws(()=>validateProductionMode(config,["--production"],{ZALO_READER_CONFIG_PATH:"test.json"}),/ENV_CONFLICT/);
  assert.throws(()=>validateProductionMode(config,["--production"],{ZALO_READER_VIDEO_PROBE:"1"}),/ENV_CONFLICT/);
  assert.throws(()=>validateProductionMode(config,["--production"],{ZALO_READER_PRODUCTION_API_URL:"https://wrong.example"}),/API_CONFLICT/);
  assert.equal(validateProductionMode(config,["--production"],{ZALO_READER_WEB_BASE_URL:"https://legacy-cdn.example"}).origin,api.origin,"legacy test environment cannot redirect production");
  const effective=effectiveReaderConfig(base,config,api,false);
  assert.equal(effective.mode,"production");assert.equal(effective.officialReader,true);
  for(const flag of ["allowReimportForTesting","testImportToPending","officialTrial","previewOnly","stagingOnlyImport"])assert.equal((effective as any)[flag],false);
  assert.equal(effective.groups.length,2);assert.equal(effective.indexedDbScrollMaxBatches,200);
  assert.equal(effective.profileDirectory,".zalo-reader/profile");assert.equal(fs.readFileSync("tools/zalo-reader/production.config.json","utf8"),configText,"one-shot config derivation never changes the scheduler setting");
  assert.equal(config.stateDirectory,".zalo-reader/official","production reuses existing checkpoints");
  const photo=(n:number)=>({url:`file:///fixture/message-${n}.webp`,cachedLocalFile:true});
  assert.deepEqual(mergeCapturedImages([photo(1),photo(2)],[photo(2),photo(3)]).map(image=>image.url),[1,2,3].map(n=>photo(n).url));
  let clock=0,captured=0;const saved:string[]=[];
  const result=await waitForStableMedia({now:()=>clock,quietMs:200,timeoutMs:2000,wait:async ms=>{clock+=ms;},
    capture:async()=>{captured++;return [{idCandidates:["album"],images:clock<200?[photo(1)]:[photo(2)],mediaPendingCount:clock<200?1:0}];},
    onCapture:async items=>{saved.push(...items.flatMap(item=>item.images.map(image=>image.url)));}});
  assert.equal(result.timedOut,false);assert.ok(captured>1);assert.ok(saved.includes(photo(1).url),"save visible image before a virtualized render replaces it");
  const old={id:"main",house_number:"10",address:"Nguyễn Huệ",district:"Quận 1",room_code:"402",price:5_000_000};
  const room={...old,price:5_500_000,_room_import:{version:1,type:"UPDATE",identity_key:normalizedRoomIdentity(old),snapshot:snapshotRoom(old,{},[{type:"image",url:"old.jpg"}]),presence:{"room.price":"value"},uncertain_fields:[]}};
  assert.equal(selectedUpdatePatch(room,{},["room.price"]).images,false,"manual field approval preserves the main album by default");
  assert.equal(selectedUpdatePatch(room,{},["room.price","images"]).images,true,"media replacement requires explicit selection");
  // Execute the actual Reader capture loop against a virtualized viewport:
  // fourteen different photos appear at index zero of the SAME message.
  const ast=ts.createSourceFile("reader.ts",fs.readFileSync("tools/zalo-reader/zalo-reader.before-semantic-parser.ts","utf8"),ts.ScriptTarget.Latest,true);
  const capture=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="captureDomMessagesWhileScrollingUp");
  assert.ok(capture);let viewport=0,tick=0,fixturePending=0;
  const cacheDir=path.resolve(".zalo-reader/offline-production-capture",crypto.randomUUID());
  const fakePage={waitForTimeout:async(ms:number)=>{tick+=ms;},evaluate:async(_fn:any,arg:any)=>{
    if(typeof arg==="string" && arg.startsWith("blob:"))return{base64:Buffer.from(arg).toString("base64"),mimeType:"image/webp"};
    if(arg?.stepRatio){const before=viewport;viewport=Math.min(13,viewport+1);return{found:true,moved:before!==viewport,atTop:viewport===13};}
  }};
  const fixtureModule={exports:{} as any};
  vm.runInNewContext(ts.transpileModule(`${capture.getText(ast)}\nmodule.exports=captureDomMessagesWhileScrollingUp;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    module:fixtureModule,fs,path,crypto,Buffer,pathToFileURL,NETWORK_LOG_DIR:cacheDir,process:{env:{}},console,
    hash:(input:string)=>crypto.createHash("sha256").update(input).digest("hex"),mergeCapturedImages,
    waitForStableMedia:(input:any)=>waitForStableMedia({...input,now:()=>tick,quietMs:200,timeoutMs:400}),
    scrollChatToBottom:async()=>{},captureVisibleDomMessages:async()=>[{order:0,top:0,bottom:400,text:"",senderName:"",timeText:"",approxTimestamp:null,idCandidates:["album-message"],images:[{url:`blob:photo-${viewport}`,idCandidates:["album-message"],usableForRoom:true}],videoUrls:[],sourceType:"identity",descendantIdentityCount:0,textLength:0,mediaPendingCount:fixturePending}],
  });
  const capturedAlbum=await fixtureModule.exports(fakePage,{selectors:{messageItems:".fixture"},indexedDbScrollMaxBatches:20,indexedDbScrollStepsPerBatch:1});
  assert.equal(capturedAlbum.items.length,1);assert.equal(capturedAlbum.items[0].images.length,14,"all fourteen virtualized slices are retained, no early stop after six repeats");
  assert.equal(capturedAlbum.blobMediaCache.cachedCount,14,"different images at index zero must never reuse the first cached photo");
  assert.ok(capturedAlbum.items[0].images.every((image:any)=>image.cachedLocalFile));
  assert.equal(capturedAlbum.items[0].albumExpectedCount,null,"observed count alone never proves album completeness");
  fixturePending=1;viewport=0;
  const stalled=await fixtureModule.exports(fakePage,{selectors:{messageItems:".fixture"},indexedDbScrollMaxBatches:20,indexedDbScrollStepsPerBatch:1});
  assert.equal(stalled.attemptedSteps,0,"never scroll away while a visible image is still loading after bounded retry");
  assert.ok(stalled.items[0].mediaWarnings.includes("MEDIA_LOADING_TIMEOUT"));
  console.log("Production config separation / conflicts / two groups / same checkpoint / immediate virtualized capture / explicit album consent: PASS (offline)");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
