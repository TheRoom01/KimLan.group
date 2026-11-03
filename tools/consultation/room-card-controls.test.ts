import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

async function main() {
  const output=path.join(os.tmpdir(),"codex-room-card-controls");fs.mkdirSync(output,{recursive:true});
  const result=await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
    import React from 'react';import{createRoot}from'react-dom/client';import Card from './components/RoomCard';import Pagination from './components/Pagination';
    const room={id:'fixture',room_code:'101',room_type:'Studio',house_number:'12',address:'Đường thử nghiệm',district:'Quận 3',price:6000000,status:'Đang trống',updated_at:new Date().toISOString(),images:[],room_detail:{has_elevator:true,has_window:true,has_balcony:true,shared_washer:true,private_washer:true,has_parking:true,fingerprint_lock:true,free_time:true}};
    createRoot(document.getElementById('root')).render(<div className='home-redesign'><Pagination goNext={()=>{}} goPrev={()=>{}} hasNext loading={false} onConsult={()=>{}}/>{[0,1,2].map(level=><section key={level} id={'level-'+level} style={{width:350,margin:'20px auto'}}><Card room={room} adminLevel={level} currentUserId={level?'admin':null} currentAdminPhone={level?'0912345678':null} onNavigate={()=>{}}/></section>)}</div>);
  `},bundle:true,write:false,outfile:path.join(output,"fixture.js"),platform:"browser",logLevel:"silent",define:{"process.env":'{}'},plugins:[{name:"offline",setup(builder){
    builder.onResolve({filter:/^(next\/(image|link|dynamic)|@\/lib\/supabase|@\/components\/(share\/ShareRoomModal|rooms\/RoomInquiryModal))$/},args=>({path:args.path,namespace:"mock"}));
    builder.onLoad({filter:/.*/,namespace:"mock"},args=>({resolveDir:process.cwd(),loader:"tsx",contents:args.path==='@/lib/supabase'?`export const supabase={};`:args.path==='next/dynamic'?`export default function dynamic(){return ()=>null}`:args.path==='next/image'?`import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>} `:args.path==='next/link'?`import React from 'react';export default function Link(props){return <a {...props}/>} `:`export default function Mock(){return null}`}));
  }}]});
  const css=(await postcss([tailwind({base:process.cwd()})]).process(fs.readFileSync("app/globals.css","utf8"),{from:path.resolve("app/globals.css")})).css;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on("pageerror",error=>console.error(error.message));await page.route("**/*",route=>route.abort());
    await page.setContent(`<html><meta name='viewport' content='width=device-width,initial-scale=1'><style>${css}${result.outputFiles.find(file=>file.path.endsWith(".css"))?.text || ""}</style><body><div id='root'></div><script>${result.outputFiles.find(file=>file.path.endsWith(".js"))!.text}</script></body></html>`);
    const anon=page.locator('#level-0');await anon.getByRole('button',{name:'Liên hệ',exact:true}).waitFor();
    assert.equal(await anon.getByRole('button',{name:'Copy địa chỉ',exact:true}).count(),0);
    assert.equal(await anon.getByRole('button',{name:'Đi xem/Tư vấn',exact:false}).count(),1);
    for(const level of [1,2]){const admin=page.locator('#level-'+level);assert.equal(await admin.getByRole('button',{name:'Copy địa chỉ',exact:true}).count(),1);assert.equal(await admin.getByRole('button',{name:'Đi xem/Tư vấn',exact:false}).count(),0);}
    const contact=anon.locator('.home-room-gallery .home-room-contact');assert.equal(await contact.count(),1);assert.equal(await anon.locator('.ai-admin-gradient-border__track').count(),0);
    assert.equal(await anon.getByText(/^Cập nhật:/).evaluate(el=>getComputedStyle(el).transform),'matrix(0.85, 0, 0, 0.85, 0, 0)');
    assert.equal(await page.getByRole('button',{name:'Cần Tư Vấn',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(146, 63, 61)');
    await contact.click();assert.ok(await page.locator('a[href="tel:0967467587"]').count()>0);await page.mouse.click(5,5);
    await page.evaluate(()=>scrollTo(0,0));const strip=anon.locator('.home-room-amenities');
    assert.equal(await strip.evaluate(el=>getComputedStyle(el).touchAction),'auto');
    const cdp=await page.context().newCDPSession(page);
    const swipe=async(dx:number,dy:number)=>{const r=await strip.boundingBox();assert.ok(r);const x=r.x+r.width/2,y=r.y+r.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);};
    await swipe(0,-180);assert.ok(await page.evaluate(()=>scrollY)>0,'vertical swipe starting on amenities scrolls the room list');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);await swipe(-140,0);assert.ok(await strip.evaluate(el=>el.scrollLeft)>0,'horizontal swipe still scrolls amenities');
    await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
    console.log('Room card controls: anon/L1/L2 visibility, public contact, gallery position, no rotating border, badge -15%, muted red CTA, real touch vertical/horizontal scroll PASS');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
