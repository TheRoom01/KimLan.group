import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { PUBLIC_THEME_BOOTSTRAP } from '../../lib/publicTheme';

declare global { interface Window {
  fixturePageShows: boolean[];
  fixtureFetches: {search?: string; cursor?: string | null}[];
  fixtureSpa: boolean;
} }

// Runs actual public components and controls against an
// isolated HTTP fixture. No Supabase, analytics, Reader or external requests.
async function main() {
const root = process.cwd();
const output = path.join(root, '.cache/light-theme');
fs.mkdirSync(output, { recursive: true });
const fixture = (page: number) => Array.from({ length: 20 }, (_, index) => ({
  id: `room-${page}-${index}`, room_code: `${page}${String(index).padStart(2, '0')}`,
  room_type: 'Studio', house_number: '236/61', address: 'Điện Biên Phủ',
  district: 'Bình Thạnh', ward: '17', price: 5_000_000 + index * 100_000,
  status: 'Đang trống', updated_at: '2026-11-01T00:00:00Z',
  image_urls: ['/fixture.webp?image=0', '/fixture.webp?image=1', '/fixture.webp?image=2'],
  image_count: 5, has_video: false, badges: [],
  description: 'Phòng thoáng, đầy đủ nội thất. '.repeat(8),
  room_detail: { has_window: true, has_balcony: true, other_amenities: 'Dọn phòng 2 lần/tuần' },
}));
const mocks: Record<string, string> = {
  '@/lib/supabase': `export const supabase={auth:{getSession:async()=>({data:{session:new URLSearchParams(location.search).has('admin')?{user:{id:'fixture-admin',email:'admin@fixture.test'}}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:1,error:null})};`,
  '@/lib/analytics/client': 'export const trackVisitorEvent=()=>{};',
  '@/lib/fetchRooms': `export async function fetchRooms(params){window.fixtureFetches.push(params);const n=params.cursor?Number(String(params.cursor).replace('cursor-','')):0;return {data:window.fixturePages[n]||[],nextCursor:n<8?'cursor-'+(n+1):null,total:180};}`,
  'next/navigation': `import{useState,useEffect}from'react';export function usePathname(){const[p,s]=useState(location.pathname);useEffect(()=>{const f=()=>s(location.pathname);addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);return p}export const useRouter=()=>({back:()=>history.back(),push:u=>location.assign(u),replace:u=>history.replaceState(history.state,'',u)});`,
  'next/link': `import React from'react';export default React.forwardRef(function Link({href,children,onClick,prefetch,scroll,replace,...props},ref){return <a {...props} ref={ref} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&window.fixtureSpa&&e.button===0){e.preventDefault();history.pushState({},'',href);dispatchEvent(new Event('fixture-route'))}}}>{children}</a>});`,
  'next/dynamic': `import React from'react';export default()=>()=>null;`,


};
const script = (await build({
  stdin: { contents: `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import Home from'./app/HomeClient';import Auth from './components/AuthControls';
  window.fixtureFetches=[];window.fixturePages=${JSON.stringify(Array.from({length:9},(_,n)=>fixture(n)))};
  window.fixtureSpa=new URLSearchParams(location.search).get('spa')==='1';
  window.fixtureMounts=0;window.fixturePageShows=[];
  addEventListener('pageshow',e=>window.fixturePageShows.push(e.persisted));
  function App(){const[detail,setDetail]=useState(location.pathname.startsWith('/rooms/'));useEffect(()=>{const f=()=>setDetail(location.pathname.startsWith('/rooms/'));addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);
    return detail?<main><h1>Chi tiết fixture</h1><button onClick={()=>history.back()}>Quay lại danh sách</button></main>:<><Auth/><Home initialRooms={window.fixturePages[0]} initialNextCursor="cursor-1" initialAdminLevel={new URLSearchParams(location.search).has("admin") ? 1 : 0} initialUserId={new URLSearchParams(location.search).has("admin") ? "fixture-admin" : null} initialTotal={180}/></>}
  createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'), loader: { '.css': 'empty', '.module.css': 'empty' },
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED': '"false"' },
  plugins: [{ name: 'offline-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));

  } }],
})).outputFiles[0].text;
const devCss = path.join(root, '.next/dev/static/css/app/layout.css');
const productionCss = path.join(root, '.next/static/css');
const cssFile = fs.existsSync(devCss) ? devCss : fs.existsSync(productionCss)
  ? fs.readdirSync(productionCss).filter(name=>name.endsWith('.css')).map(name=>path.join(productionCss,name)).find(file=>fs.readFileSync(file,'utf8').includes('.home-redesign')) : undefined;
assert.ok(cssFile, 'Run npm run build or generate the localhost:3000 application CSS first');
const css = fs.readFileSync(cssFile, 'utf8') + fs.readFileSync('app/public-theme.css','utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${PUBLIC_THEME_BOOTSTRAP}</script><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const fixtureImage = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#b78755' } }).webp().toBuffer();
let notificationRequests=0;
const server = http.createServer((req, res) => {
  if(req.url?.startsWith('/api/admin/notifications'))notificationRequests++;
  if (req.url?.startsWith('/fixture.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url?.startsWith('/fixture.webp') || req.url?.startsWith('/_next/image') || req.url?.endsWith('.jpg')) { res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); res.end(fixtureImage); }
  else if (req.url?.startsWith('/api/saved-rooms')) { res.setHeader('Content-Type','application/json'); const ids=new URL(req.url,'http://fixture').searchParams.get('ids')?.split(',')||[];res.end(JSON.stringify({data:Array.from({length:9},(_,n)=>fixture(n)).flat().filter(room=>ids.includes(room.id))})); }
  else if (req.url?.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ok:true,data:{notifications:[],unread_count:3}})); }
  else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: {width:390,height:844} });
const page = await context.newPage();
await page.addInitScript('globalThis.__name=value=>value');
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const scrollSelector='.home-redesign > .overflow-y-auto';
const state=()=>page.evaluate(selector=>({scroll:document.querySelector(selector)!.scrollTop,urls:[...document.querySelectorAll('.home-room-list a[href^="/rooms/"]')].map(e=>e.getAttribute('href')),query:location.search,calls:window.fixtureFetches.length}),scrollSelector);
try {
  await page.goto(origin+'/?spa=1');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false','existing dark default');
  const colors=()=>page.locator('.home-shortcut').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})));
  const darkColors=await colors();
  await page.getByRole('switch').click();assert.deepEqual(await colors(),darkColors,'shortcut colors unchanged');
  for(const light of [true,false]) {
    if(await page.getByRole('switch').getAttribute('aria-checked')!==String(light))await page.getByRole('switch').click();
    for(const width of [360,390,430,1366,1920]) {
      await page.setViewportSize({width,height:900});
      for(const open of [false,true]) {
        const toggle=page.getByRole('button',{name:/^Bộ lọc(?:,|$)/});
        if(await toggle.getAttribute('aria-expanded')!==String(open))await toggle.click();
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow ${width}`);
        const toggleBox=await page.getByRole('switch').boundingBox();assert(toggleBox&&toggleBox.width>=44&&toggleBox.height>=44);
        const controls=await page.locator('.home-header-inner > div').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert(controls[0].right<=controls[1].left,'header groups do not overlap');
        const columns=await page.locator('.home-room-list > .grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);if(width<=430)assert.equal(columns,2);if(width===1920)assert.equal(columns,5);
        const reset=await page.locator('.home-reset-filters').boundingBox(),heading=await page.locator('.home-list-heading').boundingBox();assert(reset&&heading);assert(Math.abs(reset.x+reset.width/2-heading.x-heading.width/2)<1,'reset truly centered');
      }
    }
  }
  // District and amenities share the same bounded, independently scrolling shell.
  for(const light of [true,false]) {
    if(await page.getByRole('switch').getAttribute('aria-checked')!==String(light))await page.getByRole('switch').click();
    for(const viewport of [{width:360,height:640},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1366,height:768},{width:1920,height:1080}]) {
      await page.setViewportSize(viewport);await page.locator(scrollSelector).evaluate(e=>e.scrollTop=0);
      const filters=page.getByRole('button',{name:/^Bộ lọc(?:,|$)/});if(await filters.getAttribute('aria-expanded')!=='true')await filters.click();
      const appearances=[];
      for(const [button,title] of [['Quận','Chọn quận'],['Tiện Nghi','Tiện nghi']]) {
        await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.waitFor();
        const bounds=await dialog.boundingBox();assert(bounds);const footerTop=await page.locator('.home-pagination').evaluate(e=>e.getBoundingClientRect().top);
        assert(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<=footerTop,`${title} remains inside viewport ${JSON.stringify(viewport)}`);
        appearances.push(await dialog.evaluate(e=>{const s=getComputedStyle(e);const input=e.querySelector('input')!;const i=getComputedStyle(input);const scroll=getComputedStyle(e.querySelector('.room-filter-choice-scroll')!);return {background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,padding:s.padding,inputAppearance:i.appearance,inputRadius:i.borderRadius,scrollWidth:scroll.scrollbarWidth,scrollColor:scroll.scrollbarColor,touchAction:scroll.touchAction}}));
        const scroller=dialog.locator('.room-filter-choice-scroll');await scroller.hover();await page.mouse.wheel(0,180);await page.waitForTimeout(100);assert(await scroller.evaluate(e=>e.scrollTop)>0,'wheel scrolls choices');assert(await dialog.isVisible(),'internal scroll keeps panel open');
        const headerTop=await dialog.locator('h3').evaluate(e=>e.getBoundingClientRect().top);await scroller.evaluate(e=>e.scrollTop=e.scrollHeight);assert.equal(await dialog.locator('h3').evaluate(e=>e.getBoundingClientRect().top),headerTop,'heading stays visible');
        await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await page.getByRole('button',{name:button,exact:true}).evaluate(e=>e===document.activeElement),true);
      }
      assert.deepEqual(appearances[0],appearances[1],'shared UI and native scroll behavior');
    }
  }
  await page.setViewportSize({width:390,height:844});await page.locator(scrollSelector).evaluate(e=>e.scrollTop=0);
  const filterToggle=page.getByRole('button',{name:/^Bộ lọc(?:,|$)/});if(await filterToggle.getAttribute('aria-expanded')!=='true')await filterToggle.click();
  const touch=await context.newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  for(const [button,title] of [['Quận','Chọn quận'],['Tiện Nghi','Tiện nghi']]) {
    await page.getByRole('button',{name:button,exact:true}).click();const dialog=page.getByRole('dialog',{name:title,exact:true});const scroller=dialog.locator('.room-filter-choice-scroll');
    await scroller.evaluate(e=>e.scrollTop=0);const box=await scroller.boundingBox();assert(box);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-20}]});
    for(let step=1;step<=8;step++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-20-step*15}]});await page.waitForTimeout(20);}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
    assert(await scroller.evaluate(e=>e.scrollTop)>0,'native touch swipe scrolls choices');assert(await dialog.isVisible(),'swipe does not close panel');
    await dialog.getByRole('button',{name:`Đóng ${title.toLowerCase()}`,exact:true}).click();assert.equal(await dialog.count(),0);
  }
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  await page.getByRole('button',{name:'Tiện Nghi',exact:true}).click();
  const amenities=page.getByRole('dialog',{name:'Tiện nghi',exact:true});await amenities.getByRole('radio',{name:'Thang máy',exact:true}).check();await amenities.getByRole('checkbox',{name:'Ban công',exact:true}).check();
  await amenities.getByRole('checkbox',{name:'Ngắn hạn',exact:true}).check();assert(await amenities.getByRole('radio',{name:'Thang máy',exact:true}).isChecked());assert(await amenities.getByRole('checkbox',{name:'Ban công',exact:true}).isChecked());
  await amenities.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(await amenities.locator('input[type="checkbox"]:checked').count(),0);assert(await amenities.getByRole('radio',{name:'Tất cả',exact:true}).isChecked());
  await page.mouse.click(2,400);assert.equal(await amenities.count(),0,'outside tap closes panel');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.home-redesign > .overflow-y-auto').evaluate(e=>e.scrollTop=0);
  if(await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).getAttribute('aria-expanded')==='true')await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).click();
  await page.waitForTimeout(400);const beforePanel=await state();
  await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).click();await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).click();await page.waitForTimeout(400);
  assert.deepEqual(await state(),beforePanel,'panel changes no query, list, page or scroll');
  await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).click();await page.getByRole('button',{name:'Quận',exact:true}).click();await page.getByText('Bình Thạnh',{exact:true}).first().click();await page.keyboard.press('Escape');await page.waitForTimeout(500);
  assert(new URL(page.url()).searchParams.get('d')?.includes('Bình Thạnh'));
  await page.getByRole('button',{name:/^Bộ lọc(?:,|$)/}).click();await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await page.waitForTimeout(500);assert.equal(new URL(page.url()).searchParams.get('d'),null);
  await page.getByPlaceholder(/^Tìm đường/).fill('Điện Biên Phủ');await page.waitForTimeout(1000);assert(await page.evaluate(()=>window.fixtureFetches.some(x=>x.search==='Điện Biên Phủ')));
  await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await page.waitForTimeout(500);
  await page.getByRole('button',{name:'Sau →',exact:true}).click();await page.locator('a[href^="/rooms/room-1-0?"]').waitFor();
  await page.locator(scrollSelector).evaluate(e=>e.scrollTop=800);await page.waitForTimeout(300);const beforeTheme=await state();
  const sameNode=await page.locator('.home-room-list').evaluateHandle(e=>e);
  await page.getByRole('switch').dispatchEvent('click');await page.waitForTimeout(100);assert.deepEqual(await state(),beforeTheme,'theme preserves scroll, pages, order, URL and queries');assert(await sameNode.evaluate(e=>e===document.querySelector('.home-room-list')),'theme does not remount list');
  await page.locator('a[href^="/rooms/room-1-0?"]').dispatchEvent('click',{button:0});await page.getByRole('heading',{name:'Chi tiết fixture'}).waitFor();await page.getByRole('button',{name:'Quay lại danh sách'}).click();await page.locator('a[href^="/rooms/room-1-0?"]').waitFor();await page.waitForTimeout(150);assert.equal((await state()).scroll,beforeTheme.scroll);
  const theme=await page.getByRole('switch').getAttribute('aria-checked');await page.reload();await page.getByRole('switch').waitFor();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),theme,'persist reload');
  await page.locator(scrollSelector).evaluate(e=>e.scrollTop=0);await page.getByRole('button',{name:'Thông báo',exact:true}).click();await page.getByRole('region',{name:'Thông báo',exact:true}).waitFor();await page.getByRole('button',{name:'Đăng nhập ngay',exact:true}).click();await page.getByRole('heading',{name:'Đăng nhập',exact:true}).waitFor();await page.getByRole('button',{name:'✕',exact:true}).click();
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('heading',{name:'Đăng nhập',exact:true}).waitFor();await page.getByRole('button',{name:'✕',exact:true}).click();
  await page.locator('.home-room-save').first().click();
  await page.locator('.home-saved-link').click();await page.getByRole('heading',{name:'Phòng đã lưu',exact:true}).waitFor();await page.locator('.home-room-card').first().waitFor();
  await page.locator('.home-saved-link').click();await page.getByRole('heading',{name:'Phòng phù hợp',exact:true}).waitFor();
  if(await page.getByRole('switch').getAttribute('aria-checked')!=='true')await page.getByRole('switch').dispatchEvent('click');
  const sheetColors=await page.evaluate(()=>{
    const overlay=document.createElement('div');overlay.dataset.homeDetail='true';overlay.className='fixed inset-0 z-[99999]';
    overlay.innerHTML='<div class="relative flex flex-col overflow-hidden md:w-[720px]"><div class="absolute inset-0 z-0 pointer-events-none"></div></div>';
    document.body.appendChild(overlay);const style=getComputedStyle(overlay.firstElementChild!);const colors={background:style.backgroundColor,color:style.color};overlay.remove();return colors;
  });
  assert.deepEqual(sheetColors,{background:'rgb(255, 253, 250)',color:'rgb(63, 53, 46)'},'light detail sheet overrides legacy important glass rules');
  assert.equal(notificationRequests,0,'guest bell must never request Admin notifications');
  await page.goto(origin+'/?admin=1');await page.getByRole('button',{name:/Thông báo, 3 chưa đọc/}).waitFor();await page.getByRole('button',{name:/Thông báo, 3 chưa đọc/}).click();await page.getByRole('region',{name:'Thông báo Admin'}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: 360/390/430/1366/1920 both themes and panel states; badges, centered reset, filter/search/pagination, no extra query on toggle, no remount/scroll change, Back, theme reload, actual notification and login controls (offline data).');
} finally { await browser.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
