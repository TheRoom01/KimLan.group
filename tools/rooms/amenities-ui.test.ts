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
  const page=await browser.newPage({viewport:{width:1100,height:1600},isMobile:true,hasTouch:true});await page.route('**/*',route=>route.abort());
  const compactCss = fs.readFileSync('app/admin/RoomModal/compact.css','utf8');
  const publicCss = fs.readFileSync('app/public-theme.css','utf8');
  await page.setContent(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#334155}output{overflow-wrap:anywhere}.grid{display:grid}.grid-cols-1{grid-template-columns:1fr}.absolute{position:absolute}.relative{position:relative}.room-amenities-options label{display:flex;align-items:center;gap:8px}${compactCss}${publicCss}</style><div id="root"></div><script>${script}</script></html>`);
  const editor=page.getByRole('region',{name:'Tiện ích phòng'});
  assert.equal(await editor.locator('.room-modal-amenities button > span > svg[aria-hidden="true"]').count(),19);
  await editor.getByRole('button',{name:'Ban công',exact:true}).click();await editor.getByRole('button',{name:'Cửa sổ',exact:true}).click();
  assert.equal(await editor.getByRole('button',{name:'Ban công',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(JSON.parse(await page.getByLabel('Chi tiết',{exact:true}).innerText()).has_window,true);
  await editor.getByRole('button',{name:'Không chung chủ',exact:true}).click();
  await editor.getByRole('button',{name:'Nhận khách nước ngoài',exact:true}).click();
  const detail = JSON.parse(await page.getByLabel('Chi tiết',{exact:true}).innerText());
  assert.equal(detail.no_live_in_landlord,true);
  assert.equal(detail.accepts_foreign_tenants,true);
  await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
  await page.getByRole('button',{name:'Tiện Nghi',exact:true}).click();await page.getByRole('checkbox',{name:'Ban công',exact:true}).check();await page.getByRole('checkbox',{name:'Cửa sổ',exact:true}).check();
  const amenitiesTrigger = page.getByRole('button',{name:'Tiện Nghi',exact:true});
  const amenities = page.getByRole('dialog',{name:'Tiện nghi',exact:true});
  const desktopPanel = (await amenities.boundingBox())!, anchor = (await amenitiesTrigger.boundingBox())!;
  assert.equal(desktopPanel.width,560);
  assert.ok(desktopPanel.y >= anchor.y + anchor.height);
  assert.equal(await amenities.locator('label svg').count(),12);
  assert.deepEqual(await amenities.locator('h4').allTextContents(),['Di chuyển','Không gian phòng','Thú cưng','Thời hạn HĐ','Quy định / Nội quy']);
  await page.getByRole('checkbox',{name:'Không chung chủ',exact:true}).check();
  await page.getByRole('checkbox',{name:'Nhận khách nước ngoài',exact:true}).check();
  assert.deepEqual(JSON.parse(await page.getByLabel('Bộ lọc',{exact:true}).innerText()),['balcony','window','no_live_in_landlord','accepts_foreign_tenants']);
  await page.getByRole('button',{name:'Clear',exact:true}).click();assert.deepEqual(JSON.parse(await page.getByLabel('Bộ lọc',{exact:true}).innerText()),[]);
  await amenities.getByRole('button',{name:'Đóng tiện nghi'}).click();
  await page.getByPlaceholder('Tìm đường, phường, quận, mã phòng...').fill('BBQ');
  await page.screenshot({path:path.join(dir,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
  await editor.evaluate(element => {
    element.classList.add('room-modal-compact');
    element.style.paddingInline = 'var(--room-modal-gutter)';
  });
  const gridRows = await editor.locator('.room-modal-amenities > button').evaluateAll(buttons => {
    const byTop = new Map<number, string[]>();
    for (const button of buttons) {
      const top = button.getBoundingClientRect().top;
      const row = byTop.get(top) ?? [];
      row.push(button.textContent?.trim() ?? '');
      byTop.set(top, row);
    }
    return [...byTop.values()];
  });
  assert.deepEqual(gridRows, [
    ['Khóa cửa vân tay','Giờ giấc tự do','Không chung chủ'],
    ['Thang bộ','Thang máy','Không thú cưng'],
    ['Cho nuôi mèo','Cho nuôi chó','Ngắn hạn'],
    ['Có hầm xe','Có chỗ gửi xe','Dài hạn'],
    ['Máy giặt riêng','Máy giặt chung','Nhận khách nước ngoài'],
    ['Máy sấy riêng','Máy sấy chung'],
    ['Ban công','Cửa sổ'],
  ]);
  const tenantButton = editor.getByRole('button',{name:'Nhận khách nước ngoài',exact:true});
  await page.addStyleTag({content:'.room-modal-amenities > button { transition: none !important; }'});
  assert.equal(await tenantButton.locator('.room-modal-amenity-switch').isVisible(),false);
  assert.equal(await tenantButton.locator('.room-modal-amenity-label > span').evaluate(label => {
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const icon = label.previousElementSibling!.getBoundingClientRect();
    const button = label.closest('button')!.getBoundingClientRect();
    return text.left >= icon.right && text.right <= button.right && button.height === 40;
  }),true);
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({colorScheme});
    assert.equal(await tenantButton.locator('svg').evaluate(icon =>
      getComputedStyle(icon).stroke === getComputedStyle(icon.parentElement!).color),true);
  }
  assert.equal(await tenantButton.evaluate(button => getComputedStyle(button).backgroundColor),'rgb(37, 99, 235)');
  await tenantButton.click();
  assert.equal(await tenantButton.getAttribute('aria-pressed'),'false');
  assert.equal(await tenantButton.evaluate(button => getComputedStyle(button).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(dir,'mobile.png'),fullPage:true});
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  for (const viewport of [{width:320,height:520},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(theme => {document.documentElement.dataset.roomTheme=theme},viewport.width === 320 ? 'dark' : 'light');
    await amenitiesTrigger.evaluate(el => el.scrollIntoView({block:'center'}));
    const triggerBounds = (await amenitiesTrigger.boundingBox())!;
    const originalScroll = await page.evaluate(() => window.scrollY);
    await page.touchscreen.tap(triggerBounds.x + triggerBounds.width / 2, triggerBounds.y + triggerBounds.height / 2);
    assert.equal(await amenities.evaluate(el => el.matches('dialog:modal')),true);
    await page.waitForFunction(() => {
      const panel = document.querySelector('dialog:modal')!.getBoundingClientRect(), visual = window.visualViewport!;
      return Math.abs(panel.x + panel.width / 2 - visual.offsetLeft - visual.width / 2) < 2 &&
        Math.abs(panel.y + panel.height / 2 - visual.offsetTop - visual.height / 2) < 2;
    });
    assert.equal(await amenities.locator('.room-amenities-options').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow),'hidden');
    const heading = amenities.getByRole('heading',{name:'Tiện nghi',exact:true});
    const headingY = (await heading.boundingBox())!.y;
    const scroll = await amenities.locator('.room-filter-choice-scroll').evaluate(el => {el.scrollTop=el.scrollHeight;return el.scrollTop});
    assert.ok(scroll>0);
    assert.equal((await heading.boundingBox())!.y,headingY);
    if(viewport.width === 320)await page.keyboard.press('Escape');
    else await page.mouse.click(2,2);
    assert.equal(await amenities.count(),0);
    assert.equal(await amenitiesTrigger.evaluate(el => el === document.activeElement),true);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow),'');
    assert.equal(await page.evaluate(() => window.scrollY),originalScroll);
  }
  console.log('Amenities editor toggles / Filterbar both features / Clear / search hint / mobile width: PASS (offline UI)');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
