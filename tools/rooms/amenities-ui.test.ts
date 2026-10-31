import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildSync} from 'esbuild';
import {chromium} from 'playwright';
async function main(){
 const dir=path.resolve('.zalo-reader/offline-amenities-ui');fs.mkdirSync(dir,{recursive:true});
 const script=buildSync({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import FilterBar from './components/FilterBar';import Amenity from './app/admin/RoomModal/RoomAmenityTab';
 function App(){const[detail,setDetail]=useState({other_amenities:'',has_balcony:false,has_window:false}),[features,setFeatures]=useState([]),[q,setQ]=useState(''),[price,setPrice]=useState([3000000,30000000]),[districts,setDistricts]=useState([]),[types,setTypes]=useState([]),[move,setMove]=useState(null),[pets,setPets]=useState([]),[terms,setTerms]=useState([]),[sort,setSort]=useState('updated_desc'),[status,setStatus]=useState(null);return <><section aria-label="Tiện ích phòng"><Amenity detailForm={detail} onChange={patch=>setDetail(current=>({...current,...patch}))}/></section><FilterBar districts={['Quận 1']} roomTypes={['Studio']} search={q} setSearch={setQ} priceDraft={price} priceApplied={price} setPriceDraft={setPrice} setPriceApplied={setPrice} selectedDistricts={districts} setSelectedDistricts={setDistricts} selectedRoomTypes={types} setSelectedRoomTypes={setTypes} moveFilter={move} setMoveFilter={setMove} petFilters={pets} setPetFilters={setPets} termFilters={terms} setTermFilters={setTerms} featureFilters={features} setFeatureFilters={setFeatures} sortMode={sort} setSortMode={setSort} statusFilter={status} setStatusFilter={setStatus}/><output aria-label="Bộ lọc">{JSON.stringify(features)}</output><output aria-label="Chi tiết">{JSON.stringify(detail)}</output></>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',logLevel:'silent',tsconfig:path.resolve('tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'}}).outputFiles[0].text;
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1600}});await page.route('**/*',route=>route.abort());
  await page.setContent(`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#334155}.grid{display:grid}.grid-cols-1{grid-template-columns:1fr}.absolute{position:absolute}.relative{position:relative}</style><div id="root"></div><script>${script}</script></html>`);
  const editor=page.getByRole('region',{name:'Tiện ích phòng'});
  await editor.getByRole('button',{name:'Ban công',exact:true}).click();await editor.getByRole('button',{name:'Cửa sổ',exact:true}).click();
  assert.equal(await editor.getByRole('button',{name:'Ban công',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(JSON.parse(await page.getByLabel('Chi tiết',{exact:true}).innerText()).has_window,true);
  await page.getByRole('button',{name:'Tiện Nghi',exact:true}).click();await page.getByRole('checkbox',{name:'Ban công',exact:true}).check();await page.getByRole('checkbox',{name:'Cửa sổ',exact:true}).check();
  assert.deepEqual(JSON.parse(await page.getByLabel('Bộ lọc',{exact:true}).innerText()),['balcony','window']);
  await page.getByRole('button',{name:'Clear',exact:true}).click();assert.deepEqual(JSON.parse(await page.getByLabel('Bộ lọc',{exact:true}).innerText()),[]);
  await page.getByPlaceholder('Tìm đường, phường, quận, mô tả, tiện nghi...').fill('BBQ');
  await page.screenshot({path:path.join(dir,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(dir,'mobile.png'),fullPage:true});
  console.log('Amenities editor toggles / Filterbar both features / Clear / search hint / mobile width: PASS (offline UI)');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
