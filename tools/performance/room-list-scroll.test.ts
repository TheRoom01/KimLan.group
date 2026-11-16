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
  google_maps_url: 'https://maps.google.com/maps?q=10.76,106.68',
  link_zalo: 'https://zalo.me/g/fixture',
  room_detail: { has_window: true, has_balcony: true, other_amenities: 'Dọn phòng 2 lần/tuần' },
}));
const mocks: Record<string, string> = {
  '@/lib/supabase': `export const supabase={auth:{getUser:async()=>{if(window.fixtureDeferredAuth)await window.fixtureDeferredAuth;window.fixtureDetailAuthFinished=true;return {data:{user:window.fixtureDetailRole==="user"?{id:"fixture-user"}:null},error:null}},getSession:async()=>({data:{session:window.fixtureHomeAdmin?{user:{id:"fixture-admin",email:"admin@fixture.test"}}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:0,error:null})};`,
  '@/lib/analytics/client': 'export const trackVisitorEvent=()=>{};',
  '@/lib/fetchRooms': `export async function fetchRooms(params){window.fixtureFetches.push(params);const n=params.cursor?Number(String(params.cursor).replace('cursor-','')):0;return {data:window.fixturePages[n]||[],nextCursor:n<8?'cursor-'+(n+1):null,total:180};}`,
  'next/navigation': `import{useState,useEffect}from'react';export function usePathname(){const[p,s]=useState(location.pathname);useEffect(()=>{const f=()=>s(location.pathname);addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);return p}export const useRouter=()=>({back:()=>history.back(),push:u=>location.assign(u),replace:u=>history.replaceState(history.state,'',u)});`,
  'next/link': `import React from'react';export default React.forwardRef(function Link({href,children,onClick,prefetch,scroll,replace,...props},ref){return <a {...props} ref={ref} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&window.fixtureSpa&&e.button===0){e.preventDefault();history.pushState({},'',href);dispatchEvent(new Event('fixture-route'))}}}>{children}</a>});`,
  'next/dynamic': `import React from'react';export default(load,options)=>{if(options?.ssr!==false||!location.search.includes("homeExtras=1"))return ()=>null;const Component=React.lazy(load);return props=><React.Suspense fallback={null}><Component {...props}/></React.Suspense>;};`,
  '@/components/LogoIntroButton': `import React from 'react';export default()=> <img src='/logo-ui.webp' alt='Logo' width={56} height={56}/>;`,
};
const script = (await build({
  stdin: { contents: `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import Home from'./app/HomeClient';import Detail from'./app/rooms/[id]/RoomDetailClient';import Auth from './components/AuthControls';
  window.fixtureFetches=[];window.fixturePages=${JSON.stringify(Array.from({length:9},(_,n)=>fixture(n)))};
  const gallery=new URLSearchParams(location.search).get("gallery")==="1";
  const role=new URLSearchParams(location.search).get("role");
  const homeExtras=new URLSearchParams(location.search).has("homeExtras");
  window.fixtureHomeAdmin=homeExtras&&role==="admin";
  if(homeExtras)for(const rooms of window.fixturePages)[15000000,15500000,7999000].forEach((price,index)=>{rooms[index].price=price;});
  window.fixtureDetailRole=role;
  if(new URLSearchParams(location.search).has("deferAuth"))window.fixtureDeferredAuth=new Promise(resolve=>{window.resolveDetailAuth=resolve;});

  window.fixtureSpa=new URLSearchParams(location.search).get('spa')==='1';
  window.fixtureMounts=0;window.fixturePageShows=[];
  addEventListener('pageshow',e=>window.fixturePageShows.push(e.persisted));
  function App(){const[detail,setDetail]=useState(location.pathname.startsWith('/rooms/'));useEffect(()=>{const f=()=>setDetail(location.pathname.startsWith('/rooms/'));addEventListener('popstate',f);addEventListener('fixture-route',f);return()=>{removeEventListener('popstate',f);removeEventListener('fixture-route',f)}},[]);
    const home=<Home initialRooms={window.fixturePages[0]} initialNextCursor="cursor-1" initialAdminLevel={window.fixtureHomeAdmin?1:0} initialUserId={window.fixtureHomeAdmin?"fixture-admin":null} initialTotal={180} initialAnonSessionId="fixture-session" initialAnonExpiresAt={new Date(Date.now()+600000).toISOString()}/>;
    if(homeExtras)return <><Auth/>{home}</>;
    if(gallery){const id=location.pathname.split('/')[2];const room=window.fixturePages[0].find(item=>item.id===id);return <>{home}{detail&&room&&<Detail roomId={id} initialRoom={room} initialUserId={!window.fixtureDeferredAuth&&role&&role!=="anon"?"fixture-"+role:null} initialAdminLevel={role==="admin"?1:0} initialAuthResolved={!window.fixtureDeferredAuth} privateDetailLoaded={role==="admin"}/>}</>;}
    return detail?<main><h1>Chi ti&#7871;t fixture</h1><button onClick={()=>history.back()}>Quay l&#7841;i danh s&#225;ch</button></main>:home}
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
const css = fs.readFileSync(cssFile, 'utf8') + fs.readFileSync('app/globals.css', 'utf8').replace(/^@import.*$/gm, '') + fs.readFileSync('app/public-theme.css', 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const fixtureImage = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#b78755' } }).webp().toBuffer();
const server = http.createServer((req, res) => {
  if (req.url === '/logo-ui.webp') { res.setHeader('Content-Type', 'image/webp'); res.end(fs.readFileSync('public/logo-ui.webp')); }
  else if (req.url?.startsWith('/fixture.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
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
  const pricePositionOnly = process.argv.includes('--price-position');
  if (pricePositionOnly || process.argv.includes('--home-extras')) {
    for (const mobile of [false, true]) for (const theme of ['dark', 'light']) for (const role of ['anon', 'admin']) {
      const device = mobile ? 'mobile' : 'desktop';
      const reducedMotion = theme === 'light' ? 'reduce' : 'no-preference';
      const context = await browser.newContext({
        viewport: mobile ? { width: 320, height: 780 } : { width: 1366, height: 900 },
        isMobile: mobile, hasTouch: mobile, reducedMotion,
      });
      const page = await context.newPage();
      await page.addInitScript(theme => {
        document.documentElement.dataset.roomTheme = theme;
        localStorage.setItem('the-room-public-theme', theme);
      }, theme);
      await page.addInitScript('globalThis.__name = value => value');
      await page.goto(`${origin}/?homeExtras=1&role=${role}`);
      await waitRoom(page, 0);
      const themeSwitch = page.getByRole('switch', { name: 'Giao diện sáng' });
      if ((await themeSwitch.getAttribute('aria-checked')) !== String(theme === 'light')) await themeSwitch.click();
      assert.equal(await themeSwitch.getAttribute('aria-checked'), String(theme === 'light'));
      if (!pricePositionOnly) {
        const map = page.getByRole('link', { name: 'Tìm bằng bản đồ' });
        assert.equal(await map.count(), 1);
        assert.equal(await map.getAttribute('href'), '/map');
        assert.ok(await map.locator(mobile ? '.home-map-short-label' : '.home-map-full-label').isVisible());
        const [left, center, right] = await Promise.all([
          page.locator('.home-header-brand').boundingBox(), map.boundingBox(), page.locator('.home-header-actions').boundingBox(),
        ]);
        assert.ok(left && center && right);
        assert.ok(left.x + left.width <= center.x && center.x + center.width <= right.x, `map sits between header clusters: ${JSON.stringify({ left, center, right })}`);
        assert.ok(Math.abs(center.x + center.width / 2 - (left.x + left.width + right.x) / 2) <= 1);
      }
      const expected = mobile ? ['15 triệu', '15,5 triệu', '7,999 triệu'] : ['15.000.000 đ', '15.500.000 đ', '7.999.000 đ'];
      for (let index = 0; index < expected.length; index++) {
        const card = page.locator('.home-room-list .home-room-card').nth(index);
        const price = card.locator('.home-room-price');
        assert.equal(await price.innerText(), expected[index]);
        const style = await price.evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).color]);
        assert.deepEqual(style, [mobile ? '12.8px' : '19.2px', 'rgb(96, 165, 250)']);
        const badge = await card.getByText('Đang trống', { exact: true }).first().boundingBox();
        const amount = await price.boundingBox();
        assert.ok(amount && badge);
        const meta = await card.locator('.home-room-meta').boundingBox();
        assert.ok(meta && amount.y < meta.y, 'price appears above room code and type');
        if (mobile) assert.ok(Math.abs(amount.y + amount.height / 2 - badge.y - badge.height / 2) <= 2, 'status shares the price row');
        const overlaps = amount.x < badge.x + badge.width && amount.x + amount.width > badge.x
          && amount.y < badge.y + badge.height && amount.y + amount.height > badge.y;
        assert.equal(overlaps, false, 'price and status badge do not overlap');
      }
      if (pricePositionOnly) {
        await context.close();
        console.log(`${device} ${theme} ${role}: price above metadata, no badge overlap PASS`);
        continue;
      }
      const footer = page.locator('.home-pagination');
      const consult = footer.getByRole('button', { name: 'Cần Tư Vấn' });
      if (role === 'anon') await consult.waitFor();
      else assert.equal(await consult.count(), 0);
      assert.ok(await footer.getByRole('button').evaluateAll(buttons => buttons.every(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      })), 'footer buttons fit within viewport');
      for (const [button, index] of [['Sau →', 1], ['← Trước', 0]] as const) {
        await page.locator(scrollSelector).evaluate(el => { el.scrollTop = el.scrollHeight; });
        await settle(page);
        await footer.getByRole('button', { name: button, exact: true }).click();
        await waitRoom(page, index);
        const indicator = footer.getByText(`Trang ${index + 1}`, { exact: true });
        assert.equal(await indicator.count(), 1);
        assert.equal(await indicator.evaluate(el => getComputedStyle(el).animationName), reducedMotion === 'reduce' ? 'none' : 'home-page-pulse');
        const offset = await page.evaluate(selector => {
          const scroller = document.querySelector(selector)!;
          const header = scroller.querySelector('[data-home-header]')!;
          return scroller.querySelector('#phong')!.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        }, scrollSelector);
        assert.ok(Math.abs(offset - 8) <= 1, `result title offset ${offset}`);
        if (index === 1) {
          await page.locator(scrollSelector).evaluate(el => { el.scrollTop = 0; });
          await settle(page);
          await page.screenshot({ path: path.join(output, `home-${device}-${theme}-${role}.png`), animations: 'disabled' });
        }
      }
      if (role === 'anon') {
        await consult.click();
        await page.getByRole('dialog', { name: 'TƯ VẤN PHÒNG' }).waitFor();
      }
      await context.close();
      console.log(`${device} ${theme} ${role}: map, exact price, page indicator and scroll PASS`);
    }
    return;
  }
  if (process.argv.includes('--detail-layout')) {
    for (const mobile of [false, true]) for (const theme of ['dark', 'light']) for (const role of ['anon', 'user', 'admin']) {
      const viewport = mobile ? { width: 320, height: 460 } : { width: 1366, height: 900 };
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript(theme => {
        document.documentElement.dataset.roomTheme = theme;
        localStorage.setItem('the-room-public-theme', theme);
      }, theme);
      await page.addInitScript('globalThis.__name = value => value');
      await page.goto(`${origin}/rooms/room-0-0?gallery=1&role=${role}${role === 'user' ? '&deferAuth' : ''}`);
      const modal = page.locator('[data-room-detail-modal]').first();
      await modal.waitFor();
      const toolbar = modal.locator('.room-detail-toolbar');
      const consult = toolbar.getByRole('button', { name: 'Đi xem/Tư vấn' });
      assert.equal(await consult.count(), role === 'anon' ? 1 : 0);
      assert.equal(await toolbar.getByText('GG Maps', { exact: true }).count(), 1);
      assert.equal(await toolbar.getByText('Nhóm Zalo', { exact: true }).count(), role === 'admin' ? 1 : 0);
      if (role === 'user') {
        await page.evaluate(() => (window as unknown as { resolveDetailAuth: () => void }).resolveDetailAuth());
        await page.waitForFunction(() => (window as unknown as { fixtureDetailAuthFinished?: boolean }).fixtureDetailAuthFinished);
        await settle(page);
        assert.equal(await consult.count(), 0);
      }
      const colors = await modal.evaluate(element => ({
        outer: getComputedStyle(element.querySelector('.room-detail-shell')!).backgroundColor,
        panel: getComputedStyle(element.querySelector(innerWidth >= 1200 ? '.room-detail-summary' : '.room-detail-intro')!).backgroundColor,
        price: getComputedStyle(element.querySelector('.room-price')!).color,
        header: getComputedStyle(document.querySelector('[data-home-header]')!).backdropFilter,
        homePrice: getComputedStyle(document.querySelector('.home-room-price')!).color,
      }));
      assert.notEqual(colors.outer, colors.panel);
      assert.equal(colors.price, 'rgb(96, 165, 250)');
      assert.equal(colors.homePrice, colors.price);
      assert.equal(colors.header, 'blur(12px)');
      if (mobile) {
        if (role === 'anon') {
          const overflow = await toolbar.evaluate(el => {
            el.scrollLeft = el.scrollWidth;
            return el.scrollLeft;
          });
          assert.ok(overflow > 0, 'toolbar scrolls horizontally without resizing its buttons');
          await toolbar.evaluate(el => { el.scrollLeft = 0; });
        }
        const gallery = modal.locator('.room-detail-gallery');
        const thumb = modal.getByRole('button', { name: 'Xem ảnh 2' });
        const size = await thumb.boundingBox();
        assert.equal(size?.width, 41);
        assert.equal(size?.height, 33);
        const before = [await gallery.boundingBox(), await toolbar.boundingBox()];
        const content = modal.locator('.home-detail-content');
        await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await settle(page);
        assert.deepEqual([await gallery.boundingBox(), await toolbar.boundingBox()], before);
        const scroll = await content.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
        assert.ok(scroll.top > 0 && Math.abs(scroll.top - scroll.max) <= 1);
        await thumb.click();
        assert.equal(await thumb.getAttribute('aria-pressed'), 'true');
        if (role === 'anon') {
          const stage = await gallery.locator('.room-detail-stage').boundingBox();
          assert.ok(stage);
          const session = await context.newCDPSession(page);
          const y = stage.y + stage.height * 0.75;
          for (const [type, fraction] of [['touchStart', 0.72], ['touchMove', 0.60], ['touchMove', 0.45], ['touchMove', 0.28]] as const) {
            await session.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x: stage.x + stage.width * fraction, y }] });
          }
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForFunction(() => document.querySelector('[aria-label="Xem ảnh 3"]')?.getAttribute('aria-pressed') === 'true');
          await session.detach();
        }
      }
      if (role === 'anon') {
        await consult.click();
        await page.getByRole('dialog', { name: 'Tư vấn hoặc đặt lịch xem phòng' }).waitFor();
      }
      await context.close();
      console.log(`${mobile ? 'mobile' : 'desktop'} ${theme} ${role}: room layout and auth PASS`);
    }
    return;
  }
  if (process.argv.includes('--filter-panel')) {
    for (const mobile of [false, true]) {
      const device = mobile ? 'mobile' : 'desktop';
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
        isMobile: mobile, hasTouch: mobile,
      });
      const page = await context.newPage();
      await page.addInitScript('globalThis.__name = value => value');
      await page.goto(`${origin}/?q=Studio&d=B%C3%ACnh+Th%E1%BA%A1nh&t=Studio&min=3000000&max=12000000`);
      await waitRoom(page, 0);
      await page.waitForFunction(() => document.querySelector('.home-filter-toggle')?.hasAttribute('aria-label'));
      const toggle = page.getByRole('button', { name: /^Bộ lọc/ });
      const panel = page.locator('.home-filter-controls');
      const search = page.getByPlaceholder(/^Tìm đường/);
      const applied = await toggle.getAttribute('aria-label');
      assert.equal(await search.inputValue(), 'Studio');
      await toggle.click();
      await panel.waitFor({ state: 'visible' });
      const selectedControls = await panel.innerText();
      await page.screenshot({ path: path.join(output, `filter-${device}-open.png`) });

      const grid = page.locator('[data-home-filter-scroll-target]').first();
      const scroller = page.locator(scrollSelector);
      const anchorTop = await scroller.evaluate(container => {
        const grid = container.querySelector('[data-home-filter-scroll-target]')!;
        const panel = container.querySelector<HTMLElement>('.home-filter-controls')!;
        container.scrollTop = Math.max(panel.offsetHeight + 40, grid.getBoundingClientRect().top - container.clientHeight / 2);
        return grid.getBoundingClientRect().top;
      });
      await panel.waitFor({ state: 'hidden' });
      await settle(page);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      const afterTop = await grid.evaluate(el => el.getBoundingClientRect().top);
      assert.ok(Math.abs(afterTop - anchorTop) <= 1, `${device}: room cards moved ${afterTop - anchorTop}px`);

      await scroller.evaluate(container => { container.scrollTop = 0; });
      await settle(page);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.getAttribute('aria-label'), applied);
      assert.equal(await search.inputValue(), 'Studio');
      await page.screenshot({ path: path.join(output, `filter-${device}-closed.png`) });
      await toggle.click();
      await panel.waitFor({ state: 'visible' });
      assert.equal(await panel.innerText(), selectedControls);
      await toggle.click();
      await panel.waitFor({ state: 'hidden' });
      await context.close();
      console.log(`${device}: auto-close, stable cards, closed at top, filters preserved and manual toggle PASS`);
    }
    return;
  }

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
    const assertResultStart = async () => {
      const offset = await page.evaluate(selector => {
        const scroller = document.querySelector(selector)!;
        const header = scroller.querySelector<HTMLElement>('[data-home-header]')!;
        const overlay = ['sticky', 'fixed'].includes(getComputedStyle(header).position) ? header.offsetHeight : 0;
        return scroller.querySelector('#phong')!.getBoundingClientRect().top - scroller.getBoundingClientRect().top - overlay;
      }, scrollSelector);
      assert.ok(offset >= 7 && offset <= 9, `results should be 8px below header, got ${offset}`);
    };
    if (!baseline) {
      const scroller = page.locator(scrollSelector);
      for (const [button, index] of [['Sau →', 1], ['← Trước', 0]] as const) {
        await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await settle(page);
        await page.getByRole('button', { name: button, exact: true }).click();
        await waitRoom(page, index);
        await page.getByText(`Trang ${index + 1}`, { exact: true }).waitFor();
        await assertResultStart();
        assert.equal((await listState(page)).search, 'UpdatedFixture');
      }
      console.log(`${mobile ? 'mobile' : 'desktop'}: Next/Previous preserve search and return to results below the header`);
      const galleryPage = await context.newPage();
      await galleryPage.addInitScript('globalThis.__name = value => value');
      const imageRequests: string[] = [];
      galleryPage.on('request', request => {
        if (request.url().includes('/fixture.webp?image=')) imageRequests.push(request.url());
      });
      await galleryPage.goto(`${origin}/?gallery=1&spa=1`);
      await waitRoom(galleryPage, 0);
      const card = galleryPage.locator('.home-room-gallery').nth(8);
      await card.evaluate((gallery, selector) => {
        const container = gallery.closest(selector)!;
        container.scrollTop += gallery.getBoundingClientRect().top - container.getBoundingClientRect().top - 180;
      }, scrollSelector);
      await settle(galleryPage);
      const priorScroll = (await listState(galleryPage)).scroll;
      assert.ok(priorScroll > 0);
      await galleryPage.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/fixture.webp?image=0')));
      assert.ok(imageRequests.length > 0 && imageRequests.every(url => url.endsWith('=0')), 'Home requests cover URL only');
      const cover = await card.boundingBox();
      assert.ok(cover);
      await galleryPage.mouse.click(cover.x + cover.width / 2, cover.y + 30);
      const modal = galleryPage.locator('[data-room-detail-modal]').first();
      await modal.waitFor();
      await modal.getByRole('button', { name: 'Xem ảnh 3' }).click();
      await galleryPage.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/fixture.webp?image=2')));
      await modal.getByRole('button', { name: 'Đóng', exact: true }).first().click();
      await modal.waitFor({ state: 'hidden' });
      await settle(galleryPage);
      assert.ok(Math.abs((await listState(galleryPage)).scroll - priorScroll) <= 1, 'closing gallery restores list scroll');
      await galleryPage.close();
      console.log(`${mobile ? 'mobile' : 'desktop'}: Home requests only cover; actual detail gallery loads third image; close restores scroll`);

    }
    if (baseline) {
      const scroller = page.locator(scrollSelector);
      await scroller.evaluate(el => { el.scrollTop = 999; });
      await settle(page);
      const before = (await listState(page)).scroll;
      await page.getByRole('button', { name: 'Sau →', exact: true }).click();
      await waitRoom(page, 1);
      const after = (await listState(page)).scroll;
      assert.equal(after, before, 'baseline retains the old deep scroll offset on Next');
      await page.getByRole('button', { name: '← Trước', exact: true }).click();
      await waitRoom(page, 0);
      console.log(`Baseline ${mobile ? 'mobile' : 'desktop'}: Next kept scrollTop=${after}`);
    }
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
