import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

async function main() {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Button from './app/admin/StaffAccountsButton'; createRoot(document.getElementById('root')).render(<Button />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", jsx: "automatic",
    plugins: [{ name: "mock-next-router", setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export function useRouter(){return {refresh(){}};}" }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let rows = [
      { user_id: "11111111-1111-4111-8111-111111111111", full_name: "Admin hiện tại", email: "self@example.invalid", phone: "0900000000", level: 1, created_at: "2026-11-02T10:00:00Z" },
      { user_id: "22222222-2222-4222-8222-222222222222", full_name: "Nhân viên", email: "staff@example.invalid", phone: "0900000001", level: 2, created_at: "2026-11-02T11:00:00Z" },
    ];
    let deletes = 0;
    let failPatch = false;
    await page.route("http://staff.test/**", async route => {
      const req = route.request();
      if (req.url().endsWith("/api/admin/staff")) {
        if (req.method() === "GET") return route.fulfill({ json: { accounts: rows, current_user_id: rows[0].user_id } });
        const body = req.postDataJSON();
        assert.equal(body.user_id, "22222222-2222-4222-8222-222222222222");
        if (req.method() === "PATCH") {
          if (failPatch) return route.fulfill({ status: 409, json: { error: "Quyền tài khoản đã thay đổi." } });
          assert.equal(body.expected_level, 2);
          rows[1].level = body.level;
        } else if (req.method() === "DELETE") {
          deletes++; rows = rows.filter(row => row.user_id !== body.user_id);
        }
        return route.fulfill({ json: { success: true } });
      }
      if (req.url().endsWith("/bundle.js")) return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script src="/bundle.js"></script>' });
    });
    await page.goto("http://staff.test/");
    await page.getByRole("button", { name: "Tài khoản NV", exact: true }).click();
    const list = page.getByRole("dialog", { name: "Tài khoản NV", exact: true });
    const self = list.getByRole("row").filter({ hasText: "self@example.invalid" });
    const staff = list.getByRole("row").filter({ hasText: "staff@example.invalid" });
    await staff.waitFor();
    assert.equal(await self.getByRole("button", { name: "Xóa Tài khoản", exact: true }).isDisabled(), true);
    await list.getByRole("button", { name: "Tạo tài khoản NV", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Tạo / Cấp tài khoản NV", exact: true });
    await create.waitFor();
    await create.getByRole("button", { name: "Đóng", exact: true }).last().click();
    await staff.getByRole("button", { name: "Thay đổi quyền", exact: true }).click();
    await list.getByLabel("Quyền mới", { exact: true }).selectOption("1");
    await list.getByRole("button", { name: "Lưu quyền", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("tbody tr:last-child")?.textContent?.includes("L1"));
    failPatch = true;
    await staff.getByRole("button", { name: "Thay đổi quyền", exact: true }).click();
    await list.getByLabel("Quyền mới", { exact: true }).selectOption("2");
    await list.getByRole("button", { name: "Lưu quyền", exact: true }).click();
    await list.getByRole("alert").waitFor();
    assert.match(await list.getByRole("alert").innerText(), /đã thay đổi/);
    await list.getByRole("button", { name: "Hủy", exact: true }).click();
    await staff.getByRole("button", { name: "Xóa Tài khoản", exact: true }).click();
    assert.equal(deletes, 0);
    await list.getByRole("button", { name: "Hủy", exact: true }).click();
    assert.equal(deletes, 0);
    await staff.getByRole("button", { name: "Xóa Tài khoản", exact: true }).click();
    await list.getByRole("button", { name: "Xác nhận xóa tài khoản", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
    assert.equal(deletes, 1);
    console.log("PASS: list, protected self, nested creation dialog, role mutation/reload, server error, deletion confirmation/cancel and refreshed list (mock API only)");
  } finally { await browser.close(); }
}
void main();
