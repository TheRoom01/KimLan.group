import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { normalizedRoomIdentity } from '../../../lib/zalo-import/room-comparison';

async function main() {
  const directory = path.resolve('.zalo-reader/offline-pending-media-order'); fs.mkdirSync(directory, { recursive: true });
  const stub = path.join(directory, 'RoomModal.tsx'); fs.writeFileSync(stub, 'export default function Modal(){return null}');
  const room = { house_number: '18', address: 'Sao Mai', district: 'Tân Bình', room_code: '101', room_type: 'Studio', price: 6500000, status: 'Đang trống', _reader_manual_review: true };
  const review = { version: 1, type: 'CREATE', identity_key: normalizedRoomIdentity(room), reason: 'fixture', candidate_ids: [], conflicting_pending_ids: [], snapshot: null, presence: {}, uncertain_fields: [] };
  const fixture = { id: 'pending', status: 'Chờ duyệt', room_payload: { ...room, _room_import: review }, detail_payload: { other_amenities: 'Giữ nguyên' }, batch: { raw_text: '18 Sao Mai, Tân Bình\nStudio - 6.500.000 - P.101 - trống' },
    images: [{ id: 'b', temp_image_url: 'https://example.test/b.webp', sort_order: 2 }, { id: 'a', temp_image_url: 'https://example.test/a.webp', sort_order: 0 }],
    videos: [{ id: 'v', temp_video_url: 'https://example.test/v.mp4', sort_order: 1 }] };
  const script = (await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Imports from './app/admin/zalo-imports/ZaloImportsClient';
    let fixture=${JSON.stringify(fixture)};window.calls=[];window.failSave=false;
    window.fetch=async(url,options)=>{url=String(url);const body=options?.body?JSON.parse(options.body):{};window.calls.push({url,body});
      if(url.endsWith('/draft')){if(window.failSave)return{ok:false,json:async()=>({ok:false,error:'Không lưu được thứ tự thử nghiệm.'})};fixture={...fixture,images:body.images.map(item=>({...fixture.images.find(x=>x.id===item.id),...item})),videos:body.videos.map(item=>({...fixture.videos.find(x=>x.id===item.id),...item}))};return{ok:true,json:async()=>({ok:true,changed:true,...fixture})};}
      return{ok:true,json:async()=>url.includes('/zalo-reader/status')?{ok:true,groups:[]}:{ok:true,data:[fixture],total:1}}};
    createRoot(document.getElementById('root')).render(<Imports/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', logLevel: 'silent', tsconfig: path.resolve('tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@/app/admin/RoomModal': stub } })).outputFiles[0].text;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true });
    const page = await context.newPage(); await page.route('**/*', route => route.abort());
    await page.setContent(`<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:14px system-ui"><div id="root"></div><script>${script}</script></body></html>`);
    const open = async () => { await page.getByRole('button', { name: 'Mở rộng chi tiết', exact: true }).click(); await page.getByRole('dialog', { name: 'Chi tiết Zalo Import' }).waitFor(); };
    const order = () => page.locator('[data-room-media-index]').evaluateAll(items => items.map(item => item.getAttribute('data-media-id')));
    const waitOrder = async (expected: string[]) => { await page.waitForFunction(value => JSON.stringify(Array.from(document.querySelectorAll('[data-room-media-index]'), item => item.getAttribute('data-media-id'))) === JSON.stringify(value), expected); assert.deepEqual(await order(), expected); };
    await open(); assert.deepEqual(await order(), ['a', 'v', 'b']);
    await page.locator('.zalo-import-reparse-textarea').fill('Nội dung đang sửa chưa phân tích');
    await page.locator('[data-media-id="b"]').dragTo(page.locator('[data-media-id="a"]')); await waitOrder(['b', 'a', 'v']);
    await page.getByRole('button', { name: 'Sắp xếp Video 3', exact: true }).press('ArrowLeft'); await waitOrder(['b', 'v', 'a']);
    const payload = await page.evaluate(() => (window as any).calls.filter((call: any) => call.url.endsWith('/draft')).at(-1).body);
    assert.deepEqual(payload.images, [{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 2 }]); assert.deepEqual(payload.videos, [{ id: 'v', sort_order: 1 }]);
    assert.deepEqual(payload.room_payload, {}); assert.deepEqual(payload.detail_payload, {}); assert.equal(payload.manualReviewOnly, true);
    assert.equal(await page.locator('.zalo-import-reparse-textarea').inputValue(), 'Nội dung đang sửa chưa phân tích', 'ordering does not discard unsaved source text');
    await page.evaluate(() => { (window as any).failSave = true; });
    await page.getByRole('button', { name: 'Sắp xếp Video 2', exact: true }).press('ArrowLeft'); await page.getByRole('alert').filter({ hasText: 'Không lưu được thứ tự thử nghiệm.' }).waitFor();
    assert.deepEqual(await order(), ['b', 'v', 'a'], 'failed save keeps the last saved order and reports the error');
    await page.evaluate(() => { (window as any).failSave = false; });
    await page.getByRole('button', { name: 'Đóng', exact: true }).click(); await open(); assert.deepEqual(await order(), ['b', 'v', 'a'], 'order survives closing and reopening Details');
    await page.setViewportSize({ width: 390, height: 844 });
    const handle = page.getByRole('button', { name: 'Sắp xếp Video 2', exact: true }); await handle.scrollIntoViewIfNeeded();
    const start = await handle.boundingBox(); const end = await page.locator('[data-media-id="b"]').boundingBox(); assert.ok(start && end);
    const client = await context.newCDPSession(page); const point = (box: any) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(start)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(end)] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await waitOrder(['v', 'b', 'a']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByRole('button', { name: /^Xóa (Ảnh|Video)/ }).count(), 0, 'Details only changes order; no added media deletion action');
    assert.equal(await page.evaluate(() => (window as any).calls.some((call: any) => call.url.endsWith('/approve') || call.url.endsWith('/reparse'))), false);
    await page.screenshot({ path: path.join(directory, 'detail-mobile.png'), fullPage: true });
    console.log('Expanded Details media order: desktop drag / keyboard / touch / autosave / reopen / failure keeps old order / preserves draft text / no publish: PASS (offline)');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
