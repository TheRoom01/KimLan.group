import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

async function main() {
  const directory=path.join(os.tmpdir(),"codex-consultation-ui");fs.mkdirSync(directory,{recursive:true});
  const result=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import Modal from './components/rooms/RoomInquiryModal'; import Pagination from './components/Pagination';
    import RoomList from './components/RoomList'; import AdminList from './app/admin/room-inquiries/RoomConsultRequestsClient';
    const room={id:'c8238571-bb9a-4b1c-a000-a0af599eeaaa',code:'R101',type:'Studio',address:'Quận 3',price:6000000,image:null,href:'/rooms/fixture'};
    window.calls=[]; window.release=null; window.fail=false;
    window.fetch=async(url,options={})=>{
      if(options.method==='POST') {window.calls.push(JSON.parse(options.body));await new Promise(resolve=>window.release=resolve);return {ok:!window.fail,status:window.fail?503:201,json:async()=>window.fail?{ok:false,error:{message:'Lỗi gửi thử nghiệm'}}:{ok:true,data:{request_id:'test',duplicate:false,notified_admins:1}}};}
      return {ok:true,json:async()=>({ok:true,data:{requests:[{id:'general',consultation_kind:'general_consultation',room_id:null,guest_name:'Khách tư vấn',guest_phone:'0901234567',request_type:'consultation',referral_source:'Threads',referral_detail:'Tài khoản RoomSG',status:'new',created_at:'2026-11-03T10:00:00Z'}],total:1}})};
    };
    function App(){const[open,setOpen]=useState(false),[mode,setMode]=useState('general'),[admin,setAdmin]=useState(false),[page,setPage]=useState(1);return <>
      {admin?<AdminList backHref='/'/>:<><RoomList total={8387} roomsToRender={[]} fetchError='' showSkeleton={false} adminLevel={0}/><output aria-label='Trang'>{page}</output>
      <Pagination goPrev={()=>setPage(p=>p-1)} goNext={()=>setPage(p=>p+1)} hasNext loading={false} onConsult={()=>{setMode('general');setOpen(true)}}/>
      <button onClick={()=>{setMode('room');setOpen(true)}}>Tư vấn phòng thử nghiệm</button><button onClick={()=>setAdmin(true)}>Mở quản lý</button></>}
      {open&&<Modal open mode={mode} room={mode==='room'?room:undefined} onClose={()=>setOpen(false)}/>}</>}
    createRoot(document.getElementById('root')).render(<App/>);
  `},bundle:true,write:false,outfile:path.join(directory,"app.js"),platform:"browser",define:{"process.env.NODE_ENV":'"development"'},logLevel:"silent",
    plugins:[{name:"offline-dependencies",setup(builder){
      builder.onResolve({filter:/RoomInquiryTurnstile$/},()=>({path:"turnstile",namespace:"fixture"}));
      builder.onResolve({filter:/^@\/components\/RoomCard(?:Skeleton)?$/},()=>({path:"card",namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"tsx",contents:args.path==="turnstile"?`import React,{forwardRef,useImperativeHandle} from 'react'; export default forwardRef(function Captcha(p,ref){useImperativeHandle(ref,()=>({execute:async()=> 'offline-token',reset(){}}));return <div/>})`:`export default function Card(){return null}`,resolveDir:process.cwd()}));
    }}]});
  const css=(await postcss([tailwind({base:process.cwd()})]).process(fs.readFileSync("app/globals.css","utf8"),{from:path.resolve("app/globals.css")})).css;
  const script=result.outputFiles.find(file=>file.path.endsWith(".js"))!.text;
  const moduleCss=result.outputFiles.find(file=>file.path.endsWith(".css"))!.text;
  const html=`<html lang='vi'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>${css}\n${moduleCss}</style><body><div id='root'></div><script>${script}</script></body></html>`;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});await page.route("**/*",route=>route.abort());await page.setContent(html);
    assert.equal(await page.getByText("Tổng 8.387 phòng",{exact:true}).count(),1);
    await page.getByRole("button",{name:"Sau →",exact:true}).click();assert.equal(await page.getByLabel("Trang").innerText(),"2");
    await page.getByRole("button",{name:"← Trước",exact:true}).click();assert.equal(await page.getByLabel("Trang").innerText(),"1");
    await page.getByRole("button",{name:"Cần Tư Vấn",exact:true}).click();const dialog=page.getByRole("dialog");
    await page.getByRole("heading",{name:"TƯ VẤN PHÒNG",exact:true}).waitFor();
    assert.equal(await dialog.getByRole("img").count(),0);assert.equal(await dialog.getByRole("link").count(),0);assert.equal(await dialog.getByText("R101").count(),0);
    assert.equal(await dialog.evaluate(element=>getComputedStyle(element).backgroundColor),"rgb(251, 247, 241)");
    const name=dialog.getByLabel("Họ và tên *",{exact:true}),phone=dialog.getByLabel("Số điện thoại *",{exact:true}),send=dialog.getByRole("button",{name:"Gửi yêu cầu tư vấn",exact:true});
    await send.click();assert.equal(await page.evaluate(()=>(window as any).calls.length),0);
    await name.fill("Khách mới");await phone.fill("123456789");await send.click();await page.getByRole("alert").waitFor();assert.equal(await page.evaluate(()=>(window as any).calls.length),0);
    await phone.fill("0901234567");await dialog.getByLabel("Facebook",{exact:true}).check();await dialog.getByLabel("TikTok",{exact:true}).check();
    assert.equal(await dialog.getByLabel("Facebook",{exact:true}).isChecked(),false);
    await dialog.getByLabel("Kênh hoặc nguồn giới thiệu cụ thể",{exact:true}).fill("Nhóm thuê phòng SG");
    assert.equal(await name.evaluate(element=>getComputedStyle(element).backgroundColor),"rgb(255, 255, 255)","global transparent-input styles cannot override modal theme");
    await send.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,"general-mobile.png"),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await send.click();await page.getByRole("button",{name:"Đang gửi yêu cầu…"}).waitFor();
    await dialog.locator("form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    assert.equal(await page.evaluate(()=>(window as any).calls.length),1,"duplicate submit is blocked while pending");
    const body=await page.evaluate(()=>(window as any).calls[0]);assert.equal(body.room_id,null);assert.equal(body.referral_source,"TikTok");assert.equal(body.referral_detail,"Nhóm thuê phòng SG");
    await page.evaluate(()=>(window as any).release());await page.getByText("Đã nhận yêu cầu",{exact:true}).waitFor();await dialog.getByRole("button",{name:"Đóng",exact:true}).last().click();
    await page.getByRole("button",{name:"Tư vấn phòng thử nghiệm"}).click();await page.getByText("R101",{exact:false}).waitFor();
    await page.getByLabel("Đặt lịch xem",{exact:true}).check();await page.getByLabel("Ngày muốn xem *",{exact:true}).fill("2099-12-01");await page.getByLabel("Khung giờ mong muốn",{exact:true}).selectOption("Sáng (08:00–12:00)");
    await page.getByLabel("Họ và tên *",{exact:true}).fill("Khách xem phòng");await page.getByLabel("Số điện thoại *",{exact:true}).fill("0912345678");
    await page.getByRole("button",{name:"Gửi yêu cầu",exact:true}).click();await page.waitForFunction(()=>(window as any).calls.length===2);
    assert.equal(await page.evaluate(()=>(window as any).calls[1].room_id),"c8238571-bb9a-4b1c-a000-a0af599eeaaa");
    await page.evaluate(()=>{(window as any).fail=true;(window as any).release()});await page.getByText("Lỗi gửi thử nghiệm",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Đóng",exact:true}).click();await page.getByRole("button",{name:"Mở quản lý"}).click();
    await page.getByRole("heading",{name:"Tư vấn chung",exact:true}).waitFor();assert.equal(await page.getByText("Nguồn khách: Threads",{exact:true}).count(),1);assert.equal(await page.getByText("Kênh cụ thể: Tài khoản RoomSG",{exact:true}).count(),1);assert.equal(await page.getByRole("link",{name:"Mở phòng"}).count(),0);
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(directory,"staff-desktop.png"),fullPage:true});
    console.log(`Consultation UI: anon entry, theme/input contrast, no fake room, validation, single source, double-submit, error/success, viewing ID, admin source, dynamic total/pagination, mobile PASS. Screenshots: ${directory}`);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
