import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
async function main() {
  const directory=path.resolve(".zalo-reader/offline-import-location");fs.mkdirSync(directory,{recursive:true});
  const picker=path.join(directory,"Picker.tsx");fs.writeFileSync(picker,`export default function Picker({value,onChange}){return <div aria-label="Bản đồ thử nghiệm"><p>{value?value.latitude+','+value.longitude:'Chưa có ghim'}</p><button onClick={()=>onChange({latitude:10.9,longitude:106.8})}>Kéo ghim</button></div>}`);
  const bundle=await build({stdin:{contents:`import React,{StrictMode,useState}from'react';import{createRoot}from'react-dom/client';import Tab from './app/admin/RoomModal/RoomLocationTab';
    window.queries=[];window.fetch=async url=>{const q=new URL(url,'http://localhost').searchParams.get('q');window.queries.push(q);return{ok:true,json:async()=>({results:q.startsWith('Hẻm')?[]:[{id:'place',label:'Bùi Đình Túy, Phường Bình Thạnh',latitude:10.8,longitude:106.7}]})}};
    function App(){const[value,setValue]=useState(null);window.point=value;return <Tab value={value} onChange={setValue} addressQuery="Hẻm 125 Bùi Đình Túy, Phường Bình Thạnh" fallbackQueries={['Bùi Đình Túy, Phường Bình Thạnh']} autoSuggest/>};createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',tsconfig:path.resolve('tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'offline-map',setup(builder){builder.onResolve({filter:/^@\/components\/map\/LocationPicker$/},()=>({path:picker}))}}]});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',route=>route.abort());
    await page.setContent(`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`);
    await page.waitForFunction(()=>(window as any).point?.latitude===10.8);
    const queries=await page.evaluate(()=>(window as any).queries);assert.ok(queries.includes('Hẻm 125 Bùi Đình Túy, Phường Bình Thạnh'));assert.ok(queries.includes('Bùi Đình Túy, Phường Bình Thạnh'));
    assert.equal(await page.getByText('Hãy lưu phòng vào một tòa nhà trước khi chọn vị trí.').count(),0);
    await page.getByRole('button',{name:'Kéo ghim'}).click();await page.waitForFunction(()=>(window as any).point?.latitude===10.9);
    await page.screenshot({path:path.join(directory,'pending-location-mobile.png'),fullPage:true});
    console.log('Pending location UI: no building required / automatic alley query / street fallback / editable pin / StrictMode PASS (offline)');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
