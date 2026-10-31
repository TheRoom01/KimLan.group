import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {normalizeRoomFeatures,roomFeatureStatusTokens,matchesRoomFeatures} from '../../lib/rooms/features';
import {normalizeHomeSearchKeyword,roomSearchableText,roomMatchesSearch,normalizeSearchKeyword} from '../../lib/rooms/search';

async function main(){
 assert.deepEqual(normalizeRoomFeatures('balcony,window,balcony,invalid'),['balcony','window']);
 assert.deepEqual(roomFeatureStatusTokens(['window']),['__amenity:window']);
 assert.equal(matchesRoomFeatures({has_balcony:true},['balcony','window']),false);
 assert.equal(matchesRoomFeatures({has_balcony:true,has_window:true},['balcony','window']),true);
 const room={house_number:'991A',room_code:'991A',address:'Sao Mai',ward:'Phường 13',district:'Quận 1',description:'Căn 991A: sân vườn riêng',room_detail:{other_amenities:'BBQ sân thượng'}};
 assert.equal(roomMatchesSearch(room,'991a',false),false);assert.equal(roomMatchesSearch(room,'991a',true),true);
 assert.equal(roomMatchesSearch(room,'SAO MAI',false),true);assert.equal(roomMatchesSearch(room,'SÂN VƯỜN',false),true);assert.equal(roomMatchesSearch(room,'bbq',false),true);
 for(const query of ['P.13','phường13','phuong 13'])assert.equal(roomMatchesSearch(room,query,false),true);
 for(const query of ['q1','Quận 1'])assert.equal(roomMatchesSearch(room,query,false),true);
 assert.equal(normalizeHomeSearchKeyword('P.13'),'phường 13');assert.equal(normalizeSearchKeyword('P.13'),'','admin normalization remains unchanged');
 assert.ok(!roomSearchableText(room,false).includes('991a'));
 // Execute the real SSR fetch function with a recorded RPC, no database IO.
 const calls:any[]=[];const module={exports:{} as any};
 const dependencies:any={
  '@/lib/rooms/search':{normalizeHomeSearchKeyword},'@/lib/rooms/features':{roomFeatureStatusTokens},
  '@/lib/roomBadges':{attachRoomBadges:async(_db:any,rows:any[])=>rows},
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/fetchRoomsServer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module,exports:module.exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name]},console});
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return{data:{data:[],total_count:0},error:null}}};
 await module.exports.fetchRoomsServer(db,{limit:20,adminLevel:0,search:'P.13',featureFilters:['balcony','window']});
 assert.equal(calls[0].args.p_search,'phường 13');assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_statuses)),['__amenity:balcony','__amenity:window']);
 const clientModule={exports:{} as any},clientCalls:any[]=[];
 const clientDb={rpc:async(name:string,args:any)=>{clientCalls.push({name,args});return{data:name==='start_anon_session'?'offline-session':{data:[],total_count:0},error:null}}};
 const clientDependencies={...dependencies,'./supabase':{supabase:clientDb}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/fetchRooms.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:clientModule,exports:clientModule.exports,require:(name:string)=>{assert.ok(name in clientDependencies,name);return(clientDependencies as any)[name]},console,window:{},localStorage:{getItem:()=>null,setItem(){}}});
 await clientModule.exports.fetchRooms({limit:20,adminLevel:0,featureFilters:['window']});
 assert.deepEqual(JSON.parse(JSON.stringify(clientCalls.find(call=>call.name==='fetch_rooms_cursor_full_v1').args.p_statuses)),['__amenity:window'],'interactive client filtering works without any status or badge filter');
 // URL restoration and pagination signatures execute the existing Home helpers.
 const source=fs.readFileSync('app/HomeClient.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let readUrl='',buildQs='',signature='';
 function visit(node:ts.Node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='makeFilterSigValue')signature=node.getText(ast);
  if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isCallExpression(node.initializer)){
   if(node.name.getText(ast)==='readUrlState')readUrl=node.initializer.arguments[0].getText(ast);
   if(node.name.getText(ast)==='buildQs')buildQs=node.initializer.arguments[0].getText(ast);
  }ts.forEachChild(node,visit);
 }visit(ast);assert.ok(readUrl&&buildQs&&signature);
 const context:any={URLSearchParams,window:{location:{search:'?q=Sao%20Mai&features=balcony,window&term=long'}},normalizeRoomFeatures,PRICE_DEFAULT:[3000000,30000000],ROOM_BADGES:[],
  QS:{q:'q',min:'min',max:'max',d:'d',t:'t',m:'m',pet:'pet',term:'term',features:'features',s:'s',st:'st',badge:'badge',p:'p',c:'c'},parseList:(v:string)=>v?v.split(','):[],toListParam:(v:string[])=>v.join(','),decodeCursor:()=>null,encodeCursor:()=>'',canonicalQs:(qs:string)=>qs};
 const execute=(code:string)=>vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const parsed=execute(`(${readUrl})()`);assert.equal(parsed.features.join(','),'balcony,window');
 const url=execute(`(${buildQs})({q:'Sao Mai',features:['balcony','window']})`);assert.equal(new URLSearchParams(url).get('features'),'balcony,window');
 execute(signature);const base={search:'',priceApplied:[3000000,30000000],selectedDistricts:[],selectedRoomTypes:[],moveFilter:null,petFilters:[],termFilters:[],sortMode:'updated_desc',statusFilter:null};
 context.filterA={...base,featureFilters:['balcony']};context.filterB={...base,featureFilters:['window']};assert.notEqual(execute('makeFilterSigValue(filterA)'),execute('makeFilterSigValue(filterB)'),'different amenities cannot reuse stale pages/cursors');
 console.log('Room features / public searchable fields / admin house search / SSR RPC / URL restore and cache signatures: PASS (offline)');
}
main().catch(error=>{console.error(error);process.exitCode=1});
