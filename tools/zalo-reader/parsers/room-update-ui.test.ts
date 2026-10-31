import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { chromium } from "playwright";
import { snapshotRoom, normalizedRoomIdentity } from "../../../lib/zalo-import/room-comparison";

async function main() {
  const image = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${color}"/></svg>`)}`;
  const old = { id: "fixture-room", house_number: "219/89A", address: "Trần Văn Đang", district: "Quận 3", room_code: "L01", price: 5500000, room_type: "1PN", available_from: "2026-11-01" };
  const row = { matched_room_id: old.id, images: [{ temp_image_url: image("#bce3ce"), selected: true }], videos: [],
    room_payload: { ...old, price: 5800000, room_type: "Studio", _room_import: { version: 1, type: "UPDATE", identity_key: normalizedRoomIdentity(old), reason: "Fixture", candidate_ids: [old.id], conflicting_pending_ids: [],
      snapshot: snapshotRoom(old, { water_fee_value: 150000 }, [{ id: "old", type: "image", url: image("#cbd5e1"), content_hash: "old-content" }]),
      presence: { "room.price": "value", "room.room_type": "value" }, uncertain_fields: [], image_hashes: { [image("#bce3ce")]: "new-content" } } }, detail_payload: { water_fee_value: null } };
  const script = buildSync({ stdin: { contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import Comparison from './app/admin/zalo-imports/RoomUpdateComparison';
    const row=${JSON.stringify(row)};
    function App(){const [selected,setSelected]=useState([]);return <><Comparison row={row} selected={selected} onSelect={setSelected}/><output aria-label="Trường đã chọn">{JSON.stringify(selected)}</output></>}
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", define: { "process.env.NODE_ENV": '"development"' }, tsconfig: path.resolve("tsconfig.json"), logLevel: "silent" }).outputFiles[0].text;
  const directory = path.resolve(".zalo-reader/offline-room-update-ui");
  fs.mkdirSync(directory, { recursive: true });
  const html = `<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:14px system-ui;background:#f1f5f9"><div id="root"></div><script>${script}</script></body></html>`;
  fs.writeFileSync(path.join(directory, "comparison.html"), html);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.route("**/*", route => route.abort());
    await page.setContent(html);
    await page.getByRole("heading", { name: "CẬP NHẬT PHÒNG · L01" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Xem phòng hiện tại" }).getAttribute("href"), "/rooms/fixture-room");
    const price = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: "Áp dụng Giá thuê", exact: true }) });
    assert.match(await price.innerText(), /5\.500\.000 đ[\s\S]*5\.800\.000 đ/);
    assert.equal(await price.locator("td").last().evaluate(element => getComputedStyle(element).color), "rgb(21, 128, 61)");
    const missing = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: "Áp dụng Tiền nước", exact: true }) });
    assert.match(await missing.innerText(), /150\.000 đ[\s\S]*Không có thông tin mới/);
    assert.equal(await missing.getByRole("checkbox").isDisabled(), true);
    assert.match(await page.locator("body").innerText(), /ẢNH ĐÃ THAY ĐỔI/);
    assert.match(await page.locator("body").innerText(), /MEDIA_UNVERIFIED[\s\S]*Album cũ được giữ nguyên/);
    assert.equal(await page.getByRole("checkbox",{name:"Áp dụng album ảnh mới",exact:true}).isChecked(),false);
    await page.getByRole("checkbox", { name: "Áp dụng Giá thuê", exact: true }).check();
    await page.getByRole("checkbox", { name: "Áp dụng album ảnh mới", exact: true }).check();
    assert.deepEqual(JSON.parse(await page.getByLabel("Trường đã chọn").innerText()), ["room.price", "images"]);
    await page.screenshot({ path: path.join(directory, "desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Album cũ ảnh 1, xem toàn màn hình" }).click();
    assert.equal(await page.getByRole("dialog", { name: "Xem album toàn màn hình" }).isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(directory, "mobile.png"), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "comparison must not overflow mobile viewport");
    assert.equal(await page.locator("table").evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, "all comparison columns fit on mobile");
    console.log("Offline comparison UI: green changed values, missing data, explicit field selection, separate albums, fullscreen and mobile layout PASS");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
