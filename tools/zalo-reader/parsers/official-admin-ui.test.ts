import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { chromium } from "playwright";
import { OFFICIAL_ZALO_GROUPS } from "../../../lib/zalo-reader/official";
async function main(){
 const directory=path.resolve(".zalo-reader/offline-official-admin-ui");fs.mkdirSync(directory,{recursive:true});
 const stub=path.join(directory,"RoomModal.tsx");fs.writeFileSync(stub,"export default function RoomModal(){return null;}");
 const groups=OFFICIAL_ZALO_GROUPS.map((group,index)=>({group_key:group.key,group_name:group.name,group_id:group.groupId,scheduler_enabled:false,
  run:{started_at:new Date(Date.now()-(index?3:1)*3600000).toISOString(),counters:{pending_created:index?0:2},mode:"trial",error_code:index?"LOGIN_REQUIRED":null},
  health:{state:index?"error":"waiting",stale:!!index,nextAt:null}}));
 const color="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#cbd5e1"/></svg>');
 const fixtures=[{id:"prod",status:"Chờ duyệt",room_payload:{room_code:"301",price:6200000},images:Array.from({length:12},(_,i)=>({id:`i-${i}`,temp_image_url:color})),batch:{group_name:OFFICIAL_ZALO_GROUPS[1].name}},
  {id:"video-only",status:"Chờ duyệt",room_payload:{room_code:"503",price:16000000,_manual_video_required:true},images:[],videos:[],batch:{}},
  {id:"test",status:"Chờ duyệt",room_payload:{room_code:"103",is_test_import:true},images:[],batch:{}},
  {id:"published",status:"Đã duyệt",approved_room_id:"published-room",room_payload:{room_code:"302"},images:[],batch:{}}];
 const script=buildSync({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Imports from './app/admin/zalo-imports/ZaloImportsClient';
 window.offlineRequests=[];window.fetch=async(url,options)=>{window.offlineRequests.push({url:String(url),body:options?.body});return{ok:true,json:async()=>String(url).includes('/zalo-reader/status')?{ok:true,groups:${JSON.stringify(groups)}}:{ok:true,data:${JSON.stringify(fixtures)},total:4,deleted:0}}};
 window.confirm=()=>true;createRoot(document.getElementById('root')).render(<Imports/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",define:{"process.env.NODE_ENV":'"development"'},alias:{"@/app/admin/RoomModal":stub},tsconfig:path.resolve("tsconfig.json"),logLevel:"silent"}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});await page.route("**/*",route=>route.abort());
  await page.setContent(`<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:14px system-ui;background:#f1f5f9"><div id="root"></div><script>${script}</script></body></html>`);
  await page.getByText("Zalo Reader · mỗi 60 phút",{exact:true}).waitFor();
  assert.equal(await page.getByText("LOGIN_REQUIRED",{exact:true}).count(),1);
  await page.getByText("BẢN NHÁP CHÍNH THỨC · Duyệt thủ công",{exact:true}).first().waitFor();
  assert.ok(await page.getByText('Video chưa tải được — mở Chỉnh sửa để thêm video thủ công trước khi Duyệt đăng.',{exact:true}).count()>0);
  assert.equal(await page.getByRole("button",{name:"Duyệt đăng",exact:true}).first().isEnabled(),true,"production Pending exposes manual publish action");
  assert.equal(await page.getByText("BẢN NHÁP TEST · Không publish",{exact:true}).count(),1);
  assert.equal(await page.getByText("ĐÃ ĐĂNG",{exact:true}).count(),1);
  assert.equal(await page.getByText("MEDIA_UNVERIFIED",{exact:true}).count(),1);
  for(let index=0;index<11;index++)await page.getByRole("button",{name:"Ảnh sau",exact:true}).click();
  const thumbnails=page.locator(".zalo-import-thumbnail-strip button");
  assert.equal(await thumbnails.count(),12,"Imports retains all 12 stored images");
  assert.equal(await thumbnails.last().evaluate(element=>getComputedStyle(element).borderColor),"rgb(56, 189, 248)","the twelfth image is reachable");
  assert.equal(await page.getByLabel("Nhóm Zalo").locator("option").count(),3);
  await page.getByLabel("Nhóm Zalo").selectOption(OFFICIAL_ZALO_GROUPS[0].name);
  await page.getByLabel("Loại import").selectOption("UPDATE");
  await page.waitForFunction(()=> (window as any).offlineRequests.some((entry:any)=>entry.url.includes("type=UPDATE")));
  await page.getByRole("button",{name:"Xóa tất cả",exact:true}).click();
  await page.waitForFunction(()=> (window as any).offlineRequests.some((entry:any)=>entry.url.endsWith("bulk-remove")));
  const deletion=await page.evaluate(()=>JSON.parse((window as any).offlineRequests.find((entry:any)=>entry.url.endsWith("bulk-remove")).body));
  assert.equal(deletion.group,OFFICIAL_ZALO_GROUPS[0].name);assert.equal(deletion.type,"UPDATE");assert.equal(deletion.allFiltered,true);
  await page.screenshot({path:path.join(directory,"desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(directory,"mobile.png"),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Admin imports fits mobile");
  console.log("Official Admin UI status / groups / type filter / filtered bulk delete / mobile: PASS (mock API, no network)");
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
