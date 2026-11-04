import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as recommendations from '../../lib/rooms/recommendations';
const defaultRecommendationFilters: recommendations.RecommendationFilters = {
  search:'',priceFilterActive:false,minPrice:null,maxPrice:null,districts:[],roomTypes:[],
  move:null,petPolicies:[],contractTerms:[],features:[],status:null,badge:null,sortMode:'updated_desc',
};

async function main() {
  for (const role of [0,1,2]) {
    const calls: {name:string;params:ReturnType<typeof recommendations.recommendationRpcParams>}[]=[];
    const viewer={auth:{getUser:async()=>({data:{user:role?{id:'verified'}:null},error:null})},rpc:async()=>({data:role,error:null})};
    const server={rpc:(name:string,params:ReturnType<typeof recommendations.recommendationRpcParams>)=>({abortSignal:async()=>{calls.push({name,params});return {data:[],error:null}}})};
    const dependencies:Record<string,unknown>={
      'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>new Response(JSON.stringify(body),init)}},
      '@/lib/supabase/admin':{createSupabaseAdminClient:()=>server},
      '@/lib/supabase/server':{createSupabaseServerClient:async()=>viewer},
      '@/lib/rooms/recommendationAccess':{recommendationRoomsForViewer:async(rooms:unknown[])=>rooms},
      '@/lib/rooms/recommendations':recommendations,
    };
    const endpointModule={exports:{} as {POST:(request:Request)=>Promise<Response>}};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/room-recommendations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {module:endpointModule,exports:endpointModule.exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name]},console});
    const response=await endpointModule.exports.POST(new Request('http://offline.test/api/room-recommendations',{method:'POST',body:JSON.stringify({filters:{...defaultRecommendationFilters,search:'257/17 Phan Xích Long',priceFilterActive:true,minPrice:5e6,maxPrice:7e6},adminLevel:2,includeHouse:true})}));
    assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].name,'fetch_room_recommendations_v2');
    assert.equal(calls[0].params.p_max_price,9e6);assert.equal(calls[0].params.p_main_filters.maxPrice,7e6);
    assert.equal(calls[0].params.p_main_filters.includeHouse,role>0,'ignore client-supplied admin claims');
  }
  console.log('Recommendation route: v2, original vs expanded prices, verified anon/L1/L2 semantics, forged-role rejection PASS (offline)');
}
main().catch(error=>{console.error(error);process.exitCode=1});
