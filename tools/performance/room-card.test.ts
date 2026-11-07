import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { canOptimizeRoomCardImage } from '../../lib/rooms/cardImages';

declare global {
  interface Window {
    setRoom: (update: (old: Record<string, unknown>) => Record<string, unknown>) => void;
    copied: string;
    measurements: { characters: number; lines: number };
  }
}

async function main() {
  assert.equal(canOptimizeRoomCardImage('https://cdn.canhodichvu.pro/a.webp'), false);
  assert.equal(canOptimizeRoomCardImage('https://cdn.canhodichvu.pro/a.webp', true), true);
  assert.equal(canOptimizeRoomCardImage('https://unknown-legacy.example/a.webp'), false);
  assert.equal(canOptimizeRoomCardImage('//unknown-legacy.example/a.webp'), false);
  assert.equal(canOptimizeRoomCardImage('/no-image.webp', true), false);
  const root = process.cwd(); const output = path.join(root, '.cache/room-list-performance');
  fs.mkdirSync(output, { recursive: true });
  const baseline = process.argv.includes('--baseline'); const label = baseline ? 'main' : 'optimized';
  const room = { id: 'fixture', room_code: '101', room_type: 'Studio', house_number: '236/61', address: 'Điện Biên Phủ', ward: '17', district: 'Bình Thạnh', price: 5000000, status: 'Đang trống', badges: [], image_count: 3,
    image_urls: ['https://cdn.canhodichvu.pro/first.webp', 'https://cdn.canhodichvu.pro/second.webp', 'https://cdn.canhodichvu.pro/third.webp'], room_detail: { has_window: true } };
  const mocks: Record<string,string> = {
    'next/link': `import React from'react';export default({href,children,onClick,...props})=><a {...props} href={href} onClick={onClick}>{children}</a>;`,
    'next/dynamic': `export default()=>()=>null;`,
    '@/lib/supabase': `export const supabase={rpc:async()=>({data:null,error:null})};`,
  };
  const script = (await build({ stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Card from'./components/RoomCard';
    window.measurements={characters:0,lines:0};
    const originalRect=Range.prototype.getBoundingClientRect,originalRects=Range.prototype.getClientRects;
    Range.prototype.getBoundingClientRect=function(){window.measurements.characters++;return originalRect.call(this)};
    Range.prototype.getClientRects=function(){window.measurements.lines++;return originalRects.call(this)};
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text},configurable:true});
    function App(){const[room,setRoom]=useState(${JSON.stringify(room)});window.setRoom=setRoom;return <div id="card-width" style={{width:400}}><Card room={room} adminLevel={1} currentUserId="admin" onNavigate={()=>{}}/></div>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', logLevel: 'silent', tsconfig: path.join(root,'tsconfig.json'), loader: { '.module.css': 'empty' },
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }));
      if (baseline) builder.onLoad({ filter: /RoomCard\.tsx$/ }, () => ({ contents: execFileSync('git',['show','main:components/RoomCard.tsx'],{encoding:'utf8'}),loader:'tsx',resolveDir:path.join(root,'components') }));
    } }] })).outputFiles[0].text;
  const devCss=path.join(root,'.next/dev/static/css/app/layout.css');
  const productionCss=path.join(root,'.next/static/css');
  const cssFile=fs.existsSync(devCss)?devCss:fs.existsSync(productionCss)?fs.readdirSync(productionCss).filter(name=>name.endsWith('.css')).map(name=>path.join(productionCss,name)).find(file=>fs.readFileSync(file,'utf8').includes('.home-redesign')):undefined;
  assert.ok(cssFile,'Run npm run build or generate the localhost:3000 application CSS first');
  const css = fs.readFileSync(cssFile,'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
    const image = fs.readFileSync(path.join(root,'public/no-image.webp'));
    await page.route('**/*', route => route.fulfill({contentType:'image/webp',body:image}));
    await page.setContent(`<html><head><base href="https://offline.test/"><style>${css}</style></head><body><div class="home-redesign" id="root"></div><script>${script}</script></body></html>`);
    // Every image is fulfilled locally. Inspect the actual Next Image DOM,
    // without reaching external media or triggering onError fallbacks.
    await page.getByRole('button',{name:'Copy địa chỉ',exact:true}).waitFor();
    if (!baseline) {
      await page.evaluate(() => window.setRoom(old => ({ ...old, is_hidden: true })));
      await page.getByText('Đã ẩn', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Đang trống', exact: true }).count(), 0);
      await page.evaluate(() => window.setRoom(old => ({ ...old, is_hidden: false })));
      await page.getByRole('button', { name: 'Đang trống', exact: true }).waitFor();
      assert.equal(await page.getByText('Đã ẩn', { exact: true }).count(), 0);
    }
    const images = await page.locator('.home-room-gallery img').evaluateAll(nodes=>nodes.map(node=>{
      const image=node as HTMLImageElement;return {src:image.getAttribute('src'),currentSrc:image.currentSrc,srcSet:image.getAttribute('srcset'),sizes:image.getAttribute('sizes'),loading:image.loading,decoding:image.decoding};
    }));
    const positions = [];
    for (const address of ['Điện Biên Phủ', 'Nguyễn Văn Nguyễn, khu căn hộ bên cạnh công viên dài hơn hai dòng để kiểm tra địa chỉ được cắt']) {
      await page.evaluate(value => window.setRoom(old => ({...old,address:value})),address);
      for (const width of [400, 360, 290]) {
        await page.locator('#card-width').evaluate((el,width) => { (el as HTMLElement).style.width=`${width}px`; },width);
        await page.waitForTimeout(80);
        const button = page.getByRole('button',{name:'Copy địa chỉ',exact:true});
        const left = await button.evaluate(el => Number.parseFloat((el as HTMLElement).style.left));
        assert.ok(left>=0 && left<=width-20,'copy button stays inside the address');
        positions.push({address,width,left});
        await button.click();
        await page.getByRole('button',{name:'Đã copy địa chỉ',exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>window.copied),`236/61, ${address}, P. 17, Bình Thạnh`);
      }
    }
    const measured = await page.evaluate(()=>window.measurements);
    if (!baseline) { assert.equal(measured.characters,0); assert.ok(measured.lines>0); }
    assert.equal(images.length,3,'three source images remain in order');
    if (!baseline) for (let i=0;i<images.length;i++) { assert.equal(images[i].srcSet,null);assert.equal(images[i].src,room.image_urls[i]);assert.equal(images[i].decoding,'async'); }
    if (!baseline) images.forEach((image,index)=>assert.equal(image.loading,index===0?'eager':'lazy'));
    const report = {label,positions,measurements:measured,imageAttributes:images.map(({src,srcSet,sizes,loading,decoding})=>({src,srcSet,sizes,loading,decoding}))};
    fs.writeFileSync(path.join(output,`${label}-card.json`),JSON.stringify(report,null,2));
    if (!baseline && fs.existsSync(path.join(output,'main-card.json'))) {
      const before=JSON.parse(fs.readFileSync(path.join(output,'main-card.json'),'utf8'));
      for(let i=0;i<positions.length;i++)assert.ok(Math.abs(positions[i].left-before.positions[i].left)<=1,'same copy-button placement as main');
    }
    await page.screenshot({path:path.join(output,`${label}-card.png`)});
    console.log(JSON.stringify({label,measurements:measured,positions}));
    console.log('RoomCard: copy full address, short/clamped address at three widths, equivalent button position, direct CDN image order, lazy decoding and legacy hosts PASS (offline)');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
