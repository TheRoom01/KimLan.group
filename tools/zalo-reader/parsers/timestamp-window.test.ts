import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { timestampIndexWindowKeys, zdbMessageBrowserScript } from "./zdb-message-decoder";
async function main() {
 const now=Date.UTC(2026,9,31,2),from=now-86400000,group="g1986619726266954037";
 // IndexedDB orders numbers before strings; numeric upper bounds exclude ALL
 // epoch-string timestamps. Exercise the actual browser callback with this rule.
 const cmp=(a:any,b:any):number=>{
  if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++){const n=cmp(a[i],b[i]);if(n)return n;}return a.length-b.length;}
  const rank=(v:any)=>typeof v==="number"?1:typeof v==="string"?2:3;
  return rank(a)!==rank(b)?rank(a)-rank(b):a<b?-1:a>b?1:0;
 };
 const range=(lower:any,upper:any,lowerOpen=false,upperOpen=false)=>({lower,upper,lowerOpen,upperOpen});
 const included=(key:any,r:any)=>(r.lowerOpen?cmp(key,r.lower)>0:cmp(key,r.lower)>=0)&&(r.upperOpen?cmp(key,r.upper)<0:cmp(key,r.upper)<=0);
 const records=[{msgId:"before",time:from-1},{msgId:"first",time:from},{msgId:"middle",time:now-1000},{msgId:"last",time:now},{msgId:"future",time:now+1}];
 const source=ts.createSourceFile("reader.ts",fs.readFileSync("tools/zalo-reader/zalo-reader.before-semantic-parser.ts","utf8"),ts.ScriptTarget.Latest,true);
 let callback="";
 const visit=(node:ts.Node)=>{if(ts.isArrowFunction(node)&&node.getText(source).includes("DOM_WINDOW_GROUP_UNVERIFIED")&&(!callback||node.getText(source).length<callback.length))callback=node.getText(source);ts.forEachChild(node,visit);};visit(source);
 assert.ok(callback);
 for(const keyType of ["string","number"] as const) {
  const rows=records.map(row=>({...row,key:[group,keyType==="string"?String(row.time):row.time,row.msgId]}));
  const bounds=timestampIndexWindowKeys(rows[0].key[1],group,from,now);
  assert.deepEqual(rows.filter(row=>included(row.key,range(bounds.lower,bounds.upper))).map(row=>row.msgId),["first","middle","last"]);
  if(keyType==="string")assert.equal(rows.filter(row=>included(row.key,range([group,from],[group,now,[]]))).length,0,"reproduces live zero-record bug");
  let closed=0;
  const request=(result:any)=>{const req:any={};queueMicrotask(()=>{req.result=result;req.onsuccess?.();});return req;};
  const db={objectStoreNames:{contains:(name:string)=>name==="message"},close:()=>{closed++;},transaction:(_name:string,mode:string)=>{
   assert.equal(mode,"readonly");return{objectStore:()=>({indexNames:{contains:()=>true},get:(id:string)=>request(rows.some(row=>row.msgId===id)?{msgId:id,toUid:group}:null),index:()=>({
    openKeyCursor:(r:any,direction:string)=>{
     const selected=rows.filter(row=>included(row.key,r)).sort((a,b)=>cmp(a.key,b.key));if(direction==="prev")selected.reverse();
     const req:any={};let i=0;const emit=()=>{req.result=i<selected.length?{key:selected[i].key,continue:()=>{i++;queueMicrotask(emit);}}:null;req.onsuccess?.();};queueMicrotask(emit);return req;
    }
   })})};}};
  const context=vm.createContext({__name:Object,queueMicrotask,indexedDB:{databases:async()=>[{name:"zdb_fixture"}],open:()=>request(db)},IDBKeyRange:{bound:range}});
  vm.runInContext(zdbMessageBrowserScript(),context);
  const fn=vm.runInContext(ts.transpileModule(`(${callback})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  for(const preferredId of [group,""]) {
   const result=JSON.parse(JSON.stringify(await fn({preferredId,ids:["middle"],fromMs:from,toMs:now})));
   assert.deepEqual(result.stops,["before"]);
   assert.equal(result.times.first,from);assert.equal(result.times.last,now);assert.equal(result.times.future,undefined);
  }
  assert.equal(closed,2);
  await assert.rejects(()=>fn({preferredId:"",ids:["unknown"],fromMs:from,toMs:now}),/GROUP_UNVERIFIED/);
 }
 assert.throws(()=>timestampIndexWindowKeys("invalid",group,from,now),/UNSUPPORTED/);
 assert.throws(()=>timestampIndexWindowKeys([],group,from,now),/UNSUPPORTED/);
 console.log("Timestamp index string/numeric keys / actual DOM preflight / exact 24h / unknown-group rejection: PASS (offline)");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
