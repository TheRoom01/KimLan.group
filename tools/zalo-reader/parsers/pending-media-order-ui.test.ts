import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { normalizedRoomIdentity } from '../../../lib/zalo-import/room-comparison';

async function main() {
  const directory = path.resolve('.zalo-reader/offline-pending-media-order'); fs.mkdirSync(directory, { recursive: true });
  const stub = path.join(directory, 'RoomModal.tsx'); fs.writeFileSync(stub, `export default function Modal(props){return <div role="dialog" aria-label="Form chỉnh sửa"><pre id="edit-media">{JSON.stringify({images:props.pendingImages,videos:props.pendingVideos,originals:props.pendingOriginalImageIds})}</pre><button onClick={props.onClose}>Đóng form thử nghiệm</button></div>}`);
  const room = { house_number: '18', address: 'Sao Mai', district: 'Tân Bình', room_code: '101', room_type: 'Studio', price: 6500000, status: 'Đang trống', _reader_manual_review: true };
  const review = { version: 1, type: 'CREATE', identity_key: normalizedRoomIdentity(room), reason: 'fixture', candidate_ids: [], conflicting_pending_ids: [], snapshot: null, presence: {}, uncertain_fields: [] };
  const fixture = { id: 'pending', status: 'Chờ duyệt', room_payload: { ...room, _room_import: review }, detail_payload: { other_amenities: 'Giữ nguyên' }, batch: { raw_text: '18 Sao Mai, Tân Bình\nStudio - 6.500.000 - P.101 - trống' },
    images: [{ id: 'b', temp_image_url: 'https://example.test/b.webp', sort_order: 2 }, { id: 'a', temp_image_url: 'https://example.test/a.webp', sort_order: 0 }],
    videos: [{ id: 'v', temp_video_url: 'https://example.test/v.mp4', sort_order: 1 }] };
  const script = (await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Imports from './app/admin/zalo-imports/ZaloImportsClient';
    let fixture=${JSON.stringify(fixture)};window.calls=[];window.failSave=false;window.confirm=()=>true;
    window.fetch=async(url,options)=>{url=String(url);const body=options?.body?JSON.parse(options.body):{};window.calls.push({url,body});
      if(url.endsWith('/draft')){if(window.failSave)return{ok:false,json:async()=>({ok:false,error:'Không lưu được thứ tự thử nghiệm.'})};fixture={...fixture,images:body.images.map(item=>({...fixture.images.find(x=>x.id===item.id),...item})),videos:body.videos.map(item=>({...fixture.videos.find(x=>x.id===item.id),...item}))};return{ok:true,json:async()=>({ok:true,changed:true,...fixture})};}
      if(url.endsWith('/reparse'))return{ok:true,json:async()=>({ok:true,data:fixture})};
      return{ok:true,json:async()=>url.includes('/zalo-reader/status')?{ok:true,groups:[]}:{ok:true,data:[fixture],total:1}}};
    createRoot(document.getElementById('root')).render(<Imports/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', logLevel: 'silent', tsconfig: path.resolve('tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@/app/admin/RoomModal': stub } })).outputFiles[0].text;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true });
    const page = await context.newPage(); await page.route('**/*', route => /example.test\/.*\.webp$/.test(route.request().url()) ? route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#e5d4bf"/><path d="M0 100L80 30 160 100V160H0Z" fill="#b88c65"/></svg>'}) : route.abort());
    await page.setContent(`<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:14px system-ui"><div id="root"></div><script>${script}</script></body></html>`);
    const open = async () => { await page.getByRole('button', { name: 'Mở rộng chi tiết', exact: true }).click(); await page.getByRole('dialog', { name: 'Chi tiết Zalo Import' }).waitFor(); };
    const order = () => page.locator('[data-room-media-index]').evaluateAll(items => items.map(item => item.getAttribute('data-media-id')));
    const waitOrder = async (expected: string[]) => { await page.waitForFunction(value => JSON.stringify(Array.from(document.querySelectorAll('[data-room-media-index]'), item => item.getAttribute('data-media-id'))) === JSON.stringify(value), expected); assert.deepEqual(await order(), expected); };
    await open(); assert.deepEqual(await order(), ['a', 'v', 'b']);
    await page.locator('.zalo-import-reparse-textarea').fill('Nội dung đang sửa chưa phân tích');
    await page.locator('[data-media-id="b"]').dragTo(page.locator('[data-media-id="a"]')); await waitOrder(['b', 'a', 'v']);
    await page.getByRole('button', { name: 'Sắp xếp Video 3', exact: true }).press('ArrowLeft'); await waitOrder(['b', 'v', 'a']);
    const writes = () => page.evaluate(() => (window as any).calls.filter((call: any) => /\/(draft|approve)$/.test(call.url)));
    assert.equal((await writes()).length,0,'drag and keyboard reorder do not send writes');
    assert.equal(await page.locator('.zalo-import-reparse-textarea').inputValue(), 'Nội dung đang sửa chưa phân tích');
    await page.getByRole('button',{name:'Lưu bản nháp',exact:true}).click();
    await page.getByRole('dialog',{name:'Chi tiết Zalo Import'}).waitFor({state:'detached'});
    await page.getByText('Đã lưu bản nháp.',{exact:true}).waitFor();
    const payload = (await writes())[0].body;
    assert.deepEqual(payload.images, [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 2 }]); assert.deepEqual(payload.videos, [{ id: 'v', sort_order: 1 }]);
    assert.deepEqual(payload.room_payload, {}); assert.deepEqual(payload.detail_payload, {});
    assert.equal((await writes()).length,1,'one draft write on explicit save');
    await open();await waitOrder(['b','v','a']);
    await page.getByRole('button',{name:'Sắp xếp Video 2',exact:true}).press('ArrowLeft');await waitOrder(['v','b','a']);
    await page.getByRole('button',{name:'Xóa Ảnh 2',exact:true}).click();await waitOrder(['v','a']);
    assert.equal((await writes()).length,1,'remove is also local until save');
    await page.getByRole('dialog',{name:'Chi tiết Zalo Import'}).getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
    await page.getByRole('dialog',{name:'Form chỉnh sửa'}).waitFor();
    let edit=JSON.parse(await page.locator('#edit-media').innerText());assert.deepEqual(edit.images.map((item:any)=>item.id),['a']);assert.deepEqual(edit.originals,['b','a']);
    await page.getByRole('button',{name:'Đóng form thử nghiệm'}).click();await open();await waitOrder(['b','v','a']);
    await page.getByRole('button',{name:'Sắp xếp Video 2',exact:true}).press('ArrowLeft');
    await page.evaluate(() => { (window as any).failSave = true; });
    await page.getByRole('dialog',{name:'Chi tiết Zalo Import'}).getByRole('button',{name:'Duyệt đăng',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Không lưu được thứ tự thử nghiệm.'}).waitFor();
    assert.equal((await writes()).filter((call:any)=>call.url.endsWith('/approve')).length,0,'failed media save blocks approval');
    await page.getByRole('button',{name:'Mở lại chỉnh sửa',exact:true}).click();
    edit=JSON.parse(await page.locator('#edit-media').innerText());assert.equal(edit.videos[0].sort_order,0,'failed save can recover local draft');
    await page.getByRole('button',{name:'Đóng form thử nghiệm'}).click();
    await page.evaluate(() => { (window as any).failSave = false; });
    await open();await waitOrder(['b','v','a']);
    await page.getByRole('button',{name:'Sắp xếp Video 2',exact:true}).press('ArrowLeft');
    await page.getByRole('button',{name:'Phân tích lại dữ liệu',exact:true}).click();
    await page.getByText('Đã phân tích lại dữ liệu và giữ nguyên media.',{exact:true}).waitFor();await waitOrder(['v','b','a']);
    await page.getByRole('button',{name:'Sắp xếp Video 1',exact:true}).press('ArrowRight');await waitOrder(['b','v','a']);
    await page.locator('section[aria-label="Sắp xếp ảnh và video"]').screenshot({path:path.join(directory,'media-desktop.png')});
    await page.setViewportSize({ width: 390, height: 844 });
    const handle = page.getByRole('button', { name: 'Sắp xếp Video 2', exact: true }); await handle.scrollIntoViewIfNeeded();
    const start = await handle.boundingBox(); const end = await page.locator('[data-media-id="b"]').boundingBox(); assert.ok(start && end);
    const client = await context.newCDPSession(page); const point = (box: any) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const before=(await writes()).length;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await waitOrder(['v', 'b', 'a']);
    assert.equal((await writes()).length,before,'touch reorder does not autosave');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(directory, 'detail-mobile.png'), fullPage: true });
    await page.getByRole('button',{name:'Xóa Ảnh 3',exact:true}).click();
    await page.getByRole('dialog',{name:'Chi tiết Zalo Import'}).getByRole('button',{name:'Duyệt đăng',exact:true}).click();
    await page.waitForFunction(()=>(window as any).calls.some((call:any)=>call.url.endsWith('/approve')));
    const last=(await writes()).slice(-2);assert.ok(last[0].url.endsWith('/draft'));assert.ok(last[1].url.endsWith('/approve'));assert.deepEqual(last[0].body.removed_image_ids,['a']);assert.equal(last[0].body.videos[0].sort_order,0);
    console.log('Details media: square thumbnails / remove / desktop+keyboard+touch local edits / explicit save / edit transfer / failure recovery / save-before-approve PASS (offline)');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
