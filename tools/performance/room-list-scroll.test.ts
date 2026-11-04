import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';

declare global { interface Window {
  fixturePageShows: boolean[];
  fixtureFetches: {search?: string; cursor?: string | null}[];
  fixtureSpa: boolean;
} }

// Runs the actual HomeClient, FilterBar, RoomList and RoomCard against an
// isolated HTTP fixture. No Supabase, analytics, Reader or external requests.
async function main() {
const root = process.cwd();
const output = path.join(root, '.cache/room-list-performance');
fs.mkdirSync(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
const fallbacksOnly = process.argv.includes('--fallbacks-only');
const label = baseline ? 'main' : 'optimized';
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
  '@/lib/supabase': `export const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:0,error:null})};`,
  '@/lib/analytics/client': 'export const trackVisitorEvent=()=>{};',
  '@/lib/fetchRooms': `export async function fetchRooms(params){window.fixtureFetches.push(params);const n=params.cursor?Number(String(params.cursor).replace('cursor-','')):0;return {data:window.fixturePages[n]||[],nextCursor:n<8?'cursor-'+(n+1):null,total:180};}`,
  'next/navigation': `import{useState,useEffect}from'react';export function usePathname(){const[p,s]=useState(location.pathname);useEffect(()=>{const f=()=>s(location.pathname);addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);return p}export const useRouter=()=>({back:()=>history.back(),push:u=>location.assign(u),replace:u=>history.replaceState(history.state,'',u)});`,
  'next/link': `import React from'react';export default React.forwardRef(function Link({href,children,onClick,prefetch,scroll,replace,...props},ref){return <a {...props} ref={ref} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&window.fixtureSpa&&e.button===0){e.preventDefault();history.pushState({},'',href);dispatchEvent(new Event('fixture-route'))}}}>{children}</a>});`,
  'next/dynamic': `import React from'react';export default()=>()=>null;`,
  '@/components/LogoIntroButton': `export default()=>null;`,
  '@/components/admin/AdminNotificationCenter': `export default()=>null;`,
};
const script = (await build({
  stdin: { contents: `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import Home from'./app/HomeClient';
  window.fixtureFetches=[];window.fixturePages=${JSON.stringify(Array.from({length:9},(_,n)=>fixture(n)))};
  window.fixtureSpa=new URLSearchParams(location.search).get('spa')==='1';
  window.fixtureMounts=0;window.fixturePageShows=[];
  addEventListener('pageshow',e=>window.fixturePageShows.push(e.persisted));
  function App(){const[detail,setDetail]=useState(location.pathname.startsWith('/rooms/'));useEffect(()=>{const f=()=>setDetail(location.pathname.startsWith('/rooms/'));addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);
    return detail?<main><h1>Chi tiết fixture</h1><button onClick={()=>history.back()}>Quay lại danh sách</button></main>:<Home initialRooms={window.fixturePages[0]} initialNextCursor="cursor-1" initialAdminLevel={0} initialTotal={180}/>}
  createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'), loader: { '.css': 'empty', '.module.css': 'empty' },
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED': '"false"' },
  plugins: [{ name: 'offline-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));
    if (baseline) builder.onLoad({ filter: /(?:HomeClient|RoomCard)\.tsx$/ }, args => ({
      contents: execFileSync('git', ['show', `main:${path.relative(root, args.path).replace(/\\/g, '/')}`], { encoding: 'utf8' }), loader: 'tsx', resolveDir: path.dirname(args.path),
    }));
  } }],
})).outputFiles[0].text;
const devCss = path.join(root, '.next/dev/static/css/app/layout.css');
const productionCss = path.join(root, '.next/static/css');
const cssFile = fs.existsSync(devCss) ? devCss : fs.existsSync(productionCss)
  ? fs.readdirSync(productionCss).filter(name=>name.endsWith('.css')).map(name=>path.join(productionCss,name)).find(file=>fs.readFileSync(file,'utf8').includes('.home-redesign')) : undefined;
assert.ok(cssFile, 'Run npm run build or generate the localhost:3000 application CSS first');
const css = fs.readFileSync(cssFile, 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const fixtureImage = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#b78755' } }).webp().toBuffer();
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/fixture.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
  else if (req.url?.startsWith('/fixture.webp') || req.url?.startsWith('/_next/image') || req.url?.endsWith('.jpg')) { res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); res.end(fixtureImage); }
  else if (req.url?.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{}'); }
  else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--enable-features=BackForwardCache'] });
const results: Record<string, unknown> = { label, baselineCommit: execFileSync('git', ['rev-parse', 'main'], { encoding: 'utf8' }).trim() };
const scrollSelector = '.home-redesign > .overflow-y-auto';
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function waitRoom(page: Page, n: number) {
  await page.locator(`a[href^="/rooms/room-${n}-0?"]`).waitFor(); await settle(page);
}
async function listState(page: Page) {
  return page.evaluate(selector => ({
    url: location.pathname + '?' + [...new URLSearchParams(location.search)].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join('&'),
    scroll: document.querySelector(selector)!.scrollTop,
    rooms: [...document.querySelectorAll('.home-room-list a[href^="/rooms/"]')].map(a => a.getAttribute('href')),
    search: (document.querySelector('input[placeholder*="Tìm đường"]') as HTMLInputElement)?.value,
  }), scrollSelector);
}
try {
  for (const mobile of fallbacksOnly ? [] : [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 } });
    // All external network is blocked without routing browser navigation (BFCache).
    const page = await context.newPage(); await page.addInitScript('globalThis.__name = value => value');
    const errors: string[] = []; page.on('pageerror', error => { errors.push(error.message); console.error('Fixture browser:', error.message); });
    const url = `${origin}/?q=Fixture&d=B%C3%ACnh+Th%E1%BA%A1nh&t=Studio&s=price_asc&min=3000000&max=12000000&features=balcony,window&st=%C4%90ang+tr%E1%BB%91ng&spa=1`;
    await page.goto(url); await waitRoom(page, 0); await page.waitForTimeout(300);
    await page.getByPlaceholder(/^Tìm đường/).fill('UpdatedFixture');
    await page.waitForFunction(()=>window.fixtureFetches.some(request=>request.search==='UpdatedFixture'));
    await waitRoom(page,0); await page.waitForTimeout(300);
    for (let n = 1; n <= 4; n++) { await page.getByRole('button', { name: 'Sau →', exact: true }).click(); await waitRoom(page, n); }
    await page.waitForTimeout(300);
    // Count full/list vs small writes and the actual bytes synchronously written
    // while scrolling the real component. Frame timing is fixture-only.
    const metrics = await page.evaluate(async selector => {
      const el = document.querySelector(selector)!;
      const original = Storage.prototype.setItem;
      const stats = { fullWrites: 0, smallWrites: 0, bytes: 0, storageMs: 0, frames: [] as number[] };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('HOME_')) { if (key === 'HOME_STATE_V3' || key === 'HOME_BACK_SNAPSHOT_V2') stats.fullWrites++; else stats.smallWrites++; stats.bytes += value.length * 2; }
        const t = performance.now(); original.call(this, key, value); stats.storageMs += performance.now() - t;
      };
      let previous = performance.now();
      for (let frame = 0; frame < 45; frame++) {
        await new Promise(requestAnimationFrame); const now = performance.now(); stats.frames.push(now - previous); previous = now;
        el.scrollTop = (el.scrollHeight - el.clientHeight) * (frame / 44);
      }
      await new Promise(resolve => setTimeout(resolve, 400));
      Storage.prototype.setItem = original;
      const sorted = [...stats.frames].sort((a,b)=>a-b);
      return { ...stats, frames: undefined, p95FrameMs: sorted[Math.floor(sorted.length * .95)] };
    }, scrollSelector);
    results[mobile ? 'mobileScroll' : 'desktopScroll'] = metrics;
    if (!baseline) assert.equal(metrics.fullWrites, 0, 'scroll must never serialize/write the full list');
    // SPA unmount/remount, both browser Back and the in-app Back button.
    for (const appBack of [false, true]) {
      await page.locator(scrollSelector).evaluate(el => { el.scrollTop = 1234; });
      await settle(page); const before = await listState(page);
      const fetchCount = await page.evaluate(()=>window.fixtureFetches.length);
      await page.locator('a[href^="/rooms/room-4-0?"]').dispatchEvent('click', { button: 0 });
      await page.getByRole('heading', { name: 'Chi tiết fixture' }).waitFor();
      if (appBack) await page.getByRole('button', { name: 'Quay lại danh sách' }).click(); else await page.evaluate(() => history.back());
      await waitRoom(page, 4); await page.waitForTimeout(150);
      const after = await listState(page);
      assert.deepEqual(after.rooms, before.rooms, 'restore the same ordered page without fetching page zero');
      assert.equal(after.search, before.search); assert.equal(after.url, before.url);
      assert.ok(Math.abs(after.scroll - before.scroll) <= 1, `restore ${before.scroll}, got ${after.scroll}`);
      const newRequests = await page.evaluate(count=>window.fixtureFetches.slice(count),fetchCount);
      assert.ok(newRequests.every(request=>request.cursor),'Back must not refetch page zero');
    }
    // First visible frame on a fresh component mount: collect every RAF rather
    // than merely checking the final scroll offset after it has settled.
    await page.locator(scrollSelector).evaluate(el => { el.scrollTop = 1876; }); await settle(page);
    await page.locator('a[href^="/rooms/room-4-0?"]').dispatchEvent('click', { button: 0 });
    await page.getByRole('heading', { name: 'Chi tiết fixture' }).waitFor();
    const frames = await page.evaluate(async selector => {
      const positions: {top:number;room:string|null}[] = []; let active = true;
      const sample = () => { const el = document.querySelector(selector); if (el) positions.push({top:el.scrollTop,room:document.querySelector('.home-room-list a[href^="/rooms/"]')?.getAttribute('href')??null}); if (active) requestAnimationFrame(sample); };
      requestAnimationFrame(sample); history.back(); await new Promise(resolve => setTimeout(resolve, 350)); active = false; return positions;
    }, scrollSelector);
    results[mobile ? 'mobileRestoreFrames' : 'desktopRestoreFrames'] = frames;
    if (!baseline) assert.ok(frames.length > 0 && frames.every(value => Math.abs(value.top - 1876) <= 1 && value.room?.startsWith('/rooms/room-4-0?')), `visible jump or wrong page on restore: ${JSON.stringify(frames)}`);
    assert.deepEqual(errors, [], 'no component errors');
    await page.screenshot({ path: path.join(output, `${label}-${mobile ? 'mobile' : 'desktop'}.png`) });
    await context.close();
  }
  // Real document navigation/BFCache: no Playwright routing and no CDP session.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); await page.addInitScript('globalThis.__name = value => value');
  await page.goto(`${origin}/?q=Fixture&s=price_asc`); await waitRoom(page, 0);
  await page.getByRole('button', { name: 'Sau →', exact: true }).click(); await waitRoom(page, 1);
  await page.locator(scrollSelector).evaluate(el => { el.scrollTop = 1456; }); await settle(page);
  const before = await listState(page);
  await page.locator('a[href^="/rooms/room-1-0?"]').dispatchEvent('click', { button: 0 });
  await page.getByRole('heading', { name: 'Chi tiết fixture' }).waitFor();
  await page.evaluate(() => history.back()); await waitRoom(page, 1); await page.waitForTimeout(150);
  const after = await listState(page); assert.deepEqual(after, before, 'full document Back restores the list and exact scroll');
  results.bfcache = await page.evaluate(() => window.fixturePageShows);
  assert.ok((results.bfcache as boolean[]).includes(true), 'real BFCache pageshow.persisted must be exercised');
  await page.close();
  // Exercise the original readers independently, not just the preferred back
  // snapshot. Lite may fetch the current cursor; it must never restart page 0.
  const fallbackResults: {fallback:string;expected:number;actual:number;room:string|null}[]=[];
  for (const fallback of ['full', 'lite', 'default-home']) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.addInitScript('globalThis.__name = value => value');
    await page.goto(fallback==='default-home'?origin:`${origin}/?q=Fixture&s=price_asc&spa=1`);
    await waitRoom(page,0);await page.waitForTimeout(300);
    await page.evaluate(()=>{window.fixtureSpa=true});
    const target=fallback==='default-home'?0:2;
    for(let n=1;n<=target;n++){await page.getByRole('button',{name:'Sau →',exact:true}).click();await waitRoom(page,n)}
    await page.locator(scrollSelector).evaluate(el=>{el.scrollTop=999});await settle(page);await page.waitForTimeout(250);
    const before=await listState(page),fetchCount=await page.evaluate(()=>window.fixtureFetches.length);
    await page.locator(`a[href^="/rooms/room-${target}-0?"]`).dispatchEvent('click',{button:0});
    await page.getByRole('heading',{name:'Chi tiết fixture'}).waitFor();
    if(fallback!=='default-home')await page.evaluate(lite=>{sessionStorage.removeItem('HOME_BACK_SNAPSHOT_V2');if(lite)sessionStorage.removeItem('HOME_STATE_V3')},fallback==='lite');
    await page.evaluate(()=>history.back());await waitRoom(page,target);
    await page.waitForTimeout(350);
    const after=await listState(page);
    fallbackResults.push({fallback,expected:before.scroll,actual:after.scroll,room:after.rooms[0]});
    console.log(JSON.stringify({label,fallback,expected:before.scroll,actual:after.scroll,room:after.rooms[0]}));
    if(!baseline)assert.deepEqual(after,before,`${fallback}: same filters, ordered page and exact offset`);
    if(target>0){const requests=await page.evaluate(count=>window.fixtureFetches.slice(count),fetchCount);assert.ok(requests.every(request=>request.cursor),`${fallback}: no page-zero fetch`)}
    await page.close();
  }
  results.fallbacks=fallbackResults;
  fs.writeFileSync(path.join(output, `${label}${fallbacksOnly?'-fallbacks':''}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  console.log(baseline?'Main baseline recorded; visible jump/default-home failures are reported, not accepted for the optimized version.':'Room list regression: filters/order/page, browser/app Back, remount frames, document Back/BFCache, cache fallbacks and scroll-write metrics PASS (offline)');
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
