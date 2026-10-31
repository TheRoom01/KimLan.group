import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {normalizedRoomIdentity,snapshotRoom} from '../../../lib/zalo-import/room-comparison';

async function main(){
  const directory=path.resolve('.zalo-reader/offline-pending-approve-ui');fs.mkdirSync(directory,{recursive:true});
  const fakeDb=path.join(directory,'supabase.ts');fs.writeFileSync(fakeDb,`const q:any={};for(const name of ['select','eq','ilike','order','limit','in'])q[name]=()=>q;q.maybeSingle=async()=>({data:null});q.then=(resolve:any)=>resolve({data:[],error:null});export const supabase={from:()=>q,rpc:async(name:string)=>({data:name==='get_my_admin_level'?1:null,error:null}),auth:{getUser:async()=>({data:{user:{id:'offline-admin'}}})}};`);
  const info=path.join(directory,'Info.tsx');fs.writeFileSync(info,`export default function Info({value,onChange}:any){return <label>Giá thuê <input aria-label="Giá thuê" type="number" value={value.price} onChange={e=>onChange({...value,price:Number(e.target.value)})}/></label>}`);
  const blank=path.join(directory,'Blank.tsx');fs.writeFileSync(blank,'export default function Blank(){return null}');
  const old={id:'main',house_number:'18',address:'Sao Mai',district:'Tân Bình',room_code:'101',price:6000000,room_type:'Studio',status:'Đang trống'};
  const base={...old,price:6500000,property_id:'building',_reader_manual_review:true};
  async function html(update=false,needsReview=false){
    const review={version:1,type:needsReview?'NEEDS_REVIEW':update?'UPDATE':'CREATE',identity_key:needsReview?null:normalizedRoomIdentity(base),reason:needsReview?'Thiếu số nhà, tên đường, quận hoặc mã phòng.':'fixture',candidate_ids:update?['main']:[],conflicting_pending_ids:[],
      snapshot:update?snapshotRoom(old,{},[]):null,presence:{'room.price':'value'},uncertain_fields:[]};
    const script=(await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Modal from './app/admin/RoomModal';
      const fixture={...${JSON.stringify(base)},_room_import:${JSON.stringify(review)}};
      window.calls=[];window.confirmAllowed=true;window.confirmCount=0;window.failDraft=false;window.failApprove=false;window.refreshes=0;
      window.confirm=()=>{window.confirmCount++;return window.confirmAllowed};
      window.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):{};window.calls.push({url:String(url),body,method:options?.method});
        if(String(url).endsWith('/draft')){if(window.failDraft)return{ok:false,json:async()=>({ok:false,error:'DRAFT_FAILED'})};return{ok:true,json:async()=>({ok:true,changed:true,room_payload:{...fixture,...body.room_payload,server_revision:42},detail_payload:body.detail_payload,images:[],videos:[]})};}
        if(String(url).endsWith('/approve'))return{ok:!window.failApprove,json:async()=>({ok:!window.failApprove,error:window.failApprove?'APPROVE_FAILED':null,roomId:'main'})};
        return{ok:true,json:async()=>({ok:true})};};
      function App(){const[open,setOpen]=useState(true),[tab,setTab]=useState('info'),[room,setRoom]=useState(fixture),[detail,setDetail]=useState({});return <>{open?<Modal open={open} mode="pending" pendingId="pending" pendingRoomPayload={room} pendingDetailPayload={detail} pendingMatchedRoomId={${update?"'main'":"null"}} pendingImages={[]} pendingVideos={[]} editingRoom={null} activeTab={tab} setActiveTab={setTab} onClose={()=>setOpen(false)} onSaved={()=>{}} onPendingSaved={next=>{setRoom(next.room_payload);setDetail(next.detail_payload)}} onPendingApproved={()=>{window.refreshes++}}/>:<p>Đã đóng</p>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',logLevel:'silent',tsconfig:path.resolve('tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@/lib/supabase':fakeDb},plugins:[{name:'offline-tabs',setup(builder){builder.onResolve({filter:/^\.\/(RoomInfoTab|RoomLocationTab|AutoReadModal)$/},args=>({path:args.path==='./RoomInfoTab'?info:blank}))}}]})).outputFiles[0].text;
    return `<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script>${script}</script></body></html>`;
  }
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:900}});await page.route('**/*',route=>route.abort());
    const load=async(update=false,needsReview=false)=>{await page.goto('about:blank');await page.setContent(await html(update,needsReview));await page.getByRole('button',{name:'Duyệt',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[aria-label="Giá thuê"]')?.value==='6500000');};
    const writes=()=>page.evaluate(()=>(window as any).calls.filter((call:any)=>/\/(draft|approve)$/.test(call.url)));
    await load();
    const saveRect=await page.getByRole('button',{name:'Lưu nháp',exact:true}).boundingBox();const approveRect=await page.getByRole('button',{name:'Duyệt',exact:true}).boundingBox();
    assert.ok(approveRect!.x>saveRect!.x && Math.abs(approveRect!.y-saveRect!.y)<2,'Duyệt sits beside Lưu nháp');
    await page.evaluate(()=>{(window as any).confirmAllowed=false});await page.getByRole('button',{name:'Duyệt',exact:true}).click();assert.equal((await writes()).length,0,'cancel does not save or approve');
    await page.getByLabel('Giá thuê',{exact:true}).fill('6800000');await page.evaluate(()=>{(window as any).confirmAllowed=true;(window as any).failDraft=true});
    await page.getByRole('button',{name:'Duyệt',exact:true}).click();
    await page.getByText('Lỗi: Chưa duyệt: DRAFT_FAILED',{exact:true}).waitFor();
    assert.equal((await writes()).filter((call:any)=>call.url.endsWith('/approve')).length,0);
    await page.evaluate(()=>{(window as any).failDraft=false;(window as any).failApprove=true});await page.getByRole('button',{name:'Duyệt',exact:true}).click();await page.getByText('Lỗi: Chưa duyệt: APPROVE_FAILED',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Duyệt',exact:true}).isVisible(),true,'approval failure keeps the modal open');
    let calls=await writes();assert.equal(calls.filter((call:any)=>call.url.endsWith('/draft')).at(-1).body.room_payload.price,6800000);assert.equal(calls.at(-1).body.mode,'create_room');
    assert.equal(calls.filter((call:any)=>call.url.endsWith('/draft')).at(-1).body.manualReviewOnly,true);
    await page.evaluate(()=>{(window as any).failApprove=false});await page.getByRole('button',{name:'Duyệt',exact:true}).click();await page.getByText('Đã đóng',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as any).refreshes),1);
    await load(true);await page.getByRole('checkbox',{name:'Áp dụng Giá thuê',exact:true}).check();await page.getByRole('button',{name:'Duyệt',exact:true}).click();await page.getByText('Đã đóng',{exact:true}).waitFor();
    calls=await writes();assert.equal(calls.at(-1).body.mode,'update_room');assert.deepEqual(calls.at(-1).body.selectedFields,['room.price']);assert.equal(calls.at(-1).body.expectedRoomPayload.server_revision,42,'UPDATE approves exactly the saved snapshot');
    await load(false,true);await page.getByRole('button',{name:'Duyệt',exact:true}).click();
    await page.getByText(/Lỗi: Lưu nháp nếu vừa sửa dữ liệu[\s\S]*Địa chỉ và mã phòng đã đủ[\s\S]*Phân tích lại dữ liệu/).waitFor();
    assert.equal((await writes()).length,0,'stale review gives actionable reparse instructions without bypassing approval safeguards');
    await load();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(directory,'mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await page.getByText('Đã đóng',{exact:true}).waitFor();assert.equal((await writes()).filter((call:any)=>call.url.endsWith('/approve')).length,0,'ordinary Save draft never approves');
    console.log('Pending edit modal: adjacent approve button / cancel / save-before-approve / errors keep open / explicit UPDATE snapshot / mobile / ordinary draft save PASS (offline)');
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
