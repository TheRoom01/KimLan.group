import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

async function main() {
  const directory=path.resolve(".zalo-reader/offline-recommendations-ui");fs.mkdirSync(directory,{recursive:true});
  const css=(await postcss([tailwind({base:process.cwd()})]).process(fs.readFileSync("app/globals.css","utf8"),{from:path.resolve("app/globals.css")})).css;
  async function html(enabled=true) {
    const result=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import Recommendations from './components/rooms/RoomRecommendations';import RoomList from './components/RoomList';
      const base={search:'',priceFilterActive:false,minPrice:3000000,maxPrice:30000000,districts:[],roomTypes:[],move:null,petPolicies:[],contractTerms:[],features:[],status:null,badge:null,sortMode:'updated_desc'};
      const excluded='00000000-0000-4000-8000-000000000001';window.calls=[];window.pending=[];window.navigations=[];window.shareCalls=[];
      Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.shareCalls.push(data)});
      window.fetch=async(url,options={})=>{
        if(String(url).includes('/api/room-recommendations')){const body=JSON.parse(options.body);window.calls.push(body);return new Promise(resolve=>window.pending.push({signal:options.signal,finish(data,status=200){resolve({ok:status===200,json:async()=>({data})})}}));}
        return {ok:true,json:async()=>({data:null})};
      };
      window.finish=(i,data,status)=>window.pending[i].finish(data,status);
      const mainRoom={id:excluded,house_number:'257/17',room_code:'MAIN',room_type:'Studio',address:'Đường mẫu',district:'Quận 1',price:7000000,status:'Đang trống',updated_at:'2026-11-03',room_detail:{has_window:true},image_urls:[]};
      const mainRooms=Array.from({length:20},(_,i)=>({...mainRoom,house_number:i===1?'123':mainRoom.house_number,id:i===0?excluded:'00000000-0000-4000-8000-'+String(100+i).padStart(12,'0')}));
      function App(){const[filters,setFilters]=useState(base);const[level,setLevel]=useState(0);const navigate=href=>window.navigations.push(href);return <div className='home-redesign pb-32'>
        <nav style={{position:'fixed',top:0,left:0,right:0,maxWidth:'100%',display:'flex',flexWrap:'wrap',zIndex:99999,background:'white',padding:8}}>
          <button onClick={()=>setFilters({...base,districts:['Quận 1'],priceFilterActive:true,minPrice:5000000,maxPrice:7000000})}>Quận 1 giá 5–7</button>
          <button onClick={()=>setFilters({...base,districts:['Quận 3']})}>Quận 3</button>
          <button onClick={()=>setFilters({...base,features:['window']})}>Cửa sổ</button>
          <button onClick={()=>setFilters(base)}>Xóa bộ lọc</button>
          <button onClick={()=>setLevel(1)}>Admin L1</button><button onClick={()=>setLevel(2)}>Admin L2</button><button onClick={()=>setLevel(0)}>Anon</button>
        </nav><div style={{paddingTop:100}}/><RoomList fetchError='' showSkeleton={false} roomsToRender={mainRooms} adminLevel={level} currentUserId={level?'verified-user':null}
          pageIndex={0} loading={false} hasNext={true} goPrev={()=>{}} goNext={()=>{}} onNavigate={navigate} total={100} hasRecommendations/>

        <Recommendations filters={filters} excludeIds={[excluded]} adminLevel={level} currentUserId={level?'verified-user':null} onNavigate={navigate}/>
        <footer style={{position:'fixed',bottom:0,width:'100%',height:70,background:'#ddd'}}>Trước · Cần Tư Vấn · Sau</footer>
      </div>};createRoot(document.getElementById('root')).render(<App/>);
    `},bundle:true,write:false,outfile:path.join(directory,"app.js"),platform:"browser",logLevel:"silent",define:{"process.env.NEXT_PUBLIC_ROOM_CARD_IMAGE_OPTIMIZATION":'"false"',"process.env.NODE_ENV":'"development"',"process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL":'""',"process.env.NEXT_PUBLIC_R2_PUBLIC_URL":'""',"process.env.NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED":JSON.stringify(enabled?"true":"false")},plugins:[{name:"offline-dependencies",setup(builder){
      builder.onResolve({filter:/^next\/(image|link|dynamic)$/},args=>({path:args.path,namespace:"fixture"}));
      builder.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:"supabase",namespace:"fixture"}));
      builder.onResolve({filter:/RoomInquiryTurnstile$/},()=>({path:"turnstile",namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"tsx",resolveDir:process.cwd(),contents:
        args.path==='next/image'?`import React from 'react';export default function Image({fill,priority,unoptimized,blurDataURL,placeholder,...p}){return <img {...p}/>}`:
        args.path==='next/link'?`import React from 'react';export default function Link(p){return <a {...p} onClick={e=>{e.preventDefault();p.onClick?.(e)}}/>} `:
        args.path==='next/dynamic'?`import React,{useState,useEffect} from 'react';export default loader=>function Dynamic(p){const[C,setC]=useState(null);useEffect(()=>{let active=true;loader().then(m=>{if(active)setC(()=>m.default)});return()=>{active=false}},[]);return C?<C {...p}/>:null}`:
        args.path==='supabase'?`export const supabase={rpc:async()=>({data:null,error:null})}`:
        `import React,{forwardRef,useImperativeHandle} from 'react';export default forwardRef(function Captcha(p,ref){useImperativeHandle(ref,()=>({execute:async()=>'offline',reset(){}}));return <div/>})`
      }));
    }}]});
    const script=result.outputFiles.find(f=>f.path.endsWith(".js"))!.text;
    const moduleCss=result.outputFiles.find(f=>f.path.endsWith(".css"))?.text||"";
    return `<html lang='vi'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>${css}\n${moduleCss}</style><body><div id='root'></div><script>${script}</script></body></html>`;
  }
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser fixture:',e.message);});
    const content=await html();await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:content}):route.abort());
    await page.goto('http://recommendations.test');
    const calls=()=>page.evaluate(()=>(window as any).calls.length);
    const fixture=(n:number)=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,house_number:n===3?'..':'257/..',room_code:`REC${n}`,room_type:'Studio',address:'Đường mẫu',district:'Quận 1',price:6000000,status:'Đang trống',updated_at:'2026-11-03',room_detail:{has_window:true},image_urls:[],creator_admin_phone:'0901234567',creator_admin_name:'Admin thử nghiệm'});
    const compareCards=async()=>{
      await page.mouse.move(0,0);await page.waitForTimeout(180);
      const main=page.locator('.home-room-list .home-room-card').first(), recommended=page.locator('.home-room-recommendations .home-room-card').first();
      const appearance=(e:Element)=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return {width:b.width,height:b.height,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,font:s.font,shadow:s.boxShadow}};
      const before=await main.evaluate(appearance),after=await recommended.evaluate(appearance);
      assert(Math.abs(before.width-after.width)<0.1,`card width differs ${before.width} vs ${after.width}`);
      assert(Math.abs(before.height-after.height)<0.1,`card height differs ${before.height} vs ${after.height}`);
      for(const key of ['background','border','borderRadius','font','shadow'] as const)assert.equal(after[key],before[key],key);
      for(const selector of ['.home-room-price','.home-room-title','.home-room-address','.home-room-amenities']) {
        const style=(e:Element)=>{const s=getComputedStyle(e);return {color:s.color,font:s.font,padding:s.padding,lineHeight:s.lineHeight}};
        assert.deepEqual(await recommended.locator(selector).evaluate(style),await main.locator(selector).evaluate(style),selector);
      }
      const rail=page.getByRole('group',{name:'Danh sách phòng đề xuất, cuộn ngang'});
      const row=await rail.locator('.home-room-card').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().top));
      assert(row.every(top=>Math.abs(top-row[0])<0.1),'all recommendations remain on one row');
      assert(await rail.evaluate(e=>e.scrollWidth>e.clientWidth),'recommendations can scroll horizontally');
    };
    await page.waitForTimeout(150);assert.equal(await calls(),0);
    await page.getByRole('button',{name:'Quận 1 giá 5–7',exact:true}).click();await page.waitForTimeout(200);assert.equal(await calls(),0,'not loaded above lazy boundary');
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>(window as any).calls.length===1);
    await page.evaluate(data=>(window as any).finish(0,data),[fixture(1),fixture(2),fixture(2),fixture(3),...Array.from({length:25},(_,i)=>fixture(i+4))]);
    const section=page.getByRole('region',{name:/Đề xuất thêm phòng phù hợp/});await section.waitFor();
    await section.getByText('Khoảng giá: 5.000.000 – 9.000.000đ',{exact:true}).waitFor();
    assert.equal(await section.locator('.home-room-card').count(),20,'excluded and duplicate IDs removed; twenty cards maximum');
    assert.equal(await section.locator('.home-room-address').nth(1).innerText(),await page.locator('.home-room-list .home-room-address').nth(1).innerText(),'numeric house masks match the main list without double-masking');
    await page.waitForFunction(()=>document.querySelector('.home-room-recommendations [data-match-list-card="true"]'));
    await compareCards();
    const rail=section.getByRole('group',{name:'Danh sách phòng đề xuất, cuộn ngang'});
    await section.getByRole('button',{name:'Cuộn đề xuất sang phải',exact:true}).click();
    await page.waitForFunction(()=>{const e=document.querySelector('[data-match-list-card="true"]');return e&&e.scrollLeft>100});
    await section.getByRole('button',{name:'Cuộn đề xuất sang trái',exact:true}).click();
    await page.waitForFunction(()=>{const e=document.querySelector('[data-match-list-card="true"]');return e&&e.scrollLeft<1});
    await rail.evaluate(e=>{e.scrollLeft=0});
    await rail.evaluate(e=>e.scrollIntoView({block:'center'}));
    const dragBox=await rail.boundingBox();assert(dragBox);
    const beforeDrag=await page.evaluate(()=>(window as any).navigations.length);
    await page.mouse.move(dragBox.x+Math.min(600,dragBox.width-20),dragBox.y+70);await page.mouse.down();
    await page.mouse.move(dragBox.x+30,dragBox.y+70,{steps:12});await page.mouse.up();
    assert(await rail.evaluate(e=>e.scrollLeft)>50,'dragging directly on a card scrolls the recommendation rail');
    assert.equal(await page.evaluate(()=>(window as any).navigations.length),beforeDrag,'drag must not open a room');
    assert.equal(await section.evaluate(e=>getComputedStyle(e).boxShadow),'none','outer frame removed');
    const gap=await section.evaluate(e=>{const list=document.querySelector('.home-room-list .grid');const cards=list?.children;const bottom=cards?.length?cards[cards.length-1].getBoundingClientRect().bottom:0;return e.getBoundingClientRect().top-bottom});
    assert(gap<50,'recommendations sit close to the last main card row');
    await rail.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>{const e=document.querySelector('[data-match-list-card="true"]');return e&&e.scrollLeft>0});
    await rail.evaluate(e=>{e.scrollLeft=0});
    assert.equal(await calls(),1,'horizontal navigation never reloads recommendations');
    await page.evaluate(()=>scrollBy(0,-80));await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(150);assert.equal(await calls(),1);
    await section.locator('.home-room-save').first().click();assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('saved_room_ids')||'[]'))).includes(fixture(2).id));
    await section.getByRole('link',{name:'Xem chi tiết phòng REC2',exact:true}).click();assert((await page.evaluate(()=>(window as any).navigations)).some((s:string)=>s.includes(fixture(2).id)));
    await section.getByRole('button',{name:'Chia sẻ phòng',exact:true}).first().click();assert.equal(await page.evaluate(()=>(window as any).shareCalls.length),1);
    await section.getByRole('button',{name:'Liên hệ',exact:true}).first().click();await page.locator('a[href="tel:0967467587"]').first().waitFor();
    await page.locator('div.fixed.inset-0').last().click({position:{x:4,y:100}});await page.locator('a[href="tel:0967467587"]').first().waitFor({state:'detached'});
    await section.getByRole('button',{name:/Đi xem\/Tư vấn/}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Đóng',exact:true}).click();
    assert.equal(await page.getByText('Tổng 100 phòng',{exact:true}).count(),1);
    await section.screenshot({path:path.join(directory,'desktop.png')});
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(100);await compareCards();
    await page.setViewportSize({width:375,height:844});await page.waitForTimeout(100);await compareCards();
    await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.waitForTimeout(100);await compareCards();
    assert.equal(await rail.evaluate(e=>getComputedStyle(e).gridAutoFlow),'column','mobile also uses one horizontal row');
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    const actionBox=await section.getByRole('button',{name:/Đi xem\/Tư vấn/}).first().boundingBox();
    assert(actionBox&&actionBox.y+actionBox.height<=844-70,'fixed pagination does not make the consultation action unreachable');
    await section.screenshot({path:path.join(directory,'mobile.png')});
    await page.getByRole('button',{name:'Quận 3',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>(window as any).calls.length===2);
    await page.getByRole('button',{name:'Cửa sổ',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>(window as any).calls.length===3);
    assert.equal(await page.evaluate(()=>(window as any).pending[1].signal.aborted),true);
    await page.evaluate(data=>(window as any).finish(1,data),[fixture(4)]);assert.equal(await page.getByText('REC4',{exact:true}).count(),0,'old response ignored');
    await page.evaluate(()=>(window as any).finish(2,[]));await section.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Quận 3',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>(window as any).calls.length===4);
    await page.evaluate(()=>(window as any).finish(3,[],503));
    await section.getByText('Chưa tải được phòng đề xuất. Vui lòng thử lại.',{exact:true}).waitFor();
    assert.equal(await section.count(),1,'API error stays visible instead of disappearing as empty results');
    await section.getByRole('button',{name:'Thử lại',exact:true}).click();await page.waitForFunction(()=>(window as any).calls.length===5);
    await page.evaluate(data=>(window as any).finish(4,data),[fixture(5)]);await section.getByText('REC5',{exact:true}).waitFor();
    assert.equal(await section.getByText('Chưa tải được phòng đề xuất. Vui lòng thử lại.',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();assert.equal(await calls(),5);
    await page.reload();await page.getByRole('button',{name:'Quận 1 giá 5–7',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>(window as any).calls.length===1);
    await page.evaluate(data=>(window as any).finish(0,data),[fixture(2)]);await section.locator('.home-room-card').first().waitFor();
    assert(!(await section.locator('.home-room-address').innerText()).includes('257/17'));
    assert.equal(await section.getByRole('button',{name:'Copy địa chỉ',exact:true}).count(),0);
    for(const [role,index] of [[1,1],[2,2]]){
      await page.getByRole('button',{name:'Admin L'+role,exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(n=>(window as any).calls.length===n,index+1);
      await page.evaluate(({index,data})=>(window as any).finish(index,data),{index,data:[{...fixture(2),house_number:'257/17'}]});
      await section.getByRole('button',{name:'Copy địa chỉ',exact:true}).waitFor();assert((await section.locator('.home-room-address').innerText()).includes('257/17'));
      await page.getByRole('button',{name:'Anon',exact:true}).click();await section.locator('.home-room-card').first().waitFor();
      assert(!(await section.locator('.home-room-address').innerText()).includes('257/17'),'admin cache never reused after logout');
      assert.equal(await section.getByRole('button',{name:'Copy địa chỉ',exact:true}).count(),0);
    }
    const off=await html(false);await page.unroute('**/*');await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:off}):route.abort());await page.reload();
    await page.getByRole('button',{name:'Quận 1 giá 5–7',exact:true}).click();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(150);assert.equal(await calls(),0,'flag off prevents requests');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('Browser UI PASS: single horizontal row desktop/mobile, native and arrow navigation, matching Home card dimensions/theme, anon/L1/L2 display, scoped cache, lazy loading, actions, abort/retry/empty states and flag');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
