import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Mount the actual client component and verify its request contract without
// creating a real employee or sending credentials to the production project.
async function main() {
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Button from './app/admin/CreateStaffButton'; createRoot(document.getElementById('root')).render(<Button />);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  let payload: Record<string, unknown> = {};
  await page.route("http://staff.test/**", async route => {
    if (route.request().url().endsWith("/api/admin/staff")) {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { account: { email: payload.email, level: payload.level, created_at: "2026-11-02T10:00:00Z" } } });
    } else if (route.request().url().endsWith("/bundle.js")) {
      await route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
    } else await route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script src="/bundle.js"></script>' });
  });
  await page.goto("http://staff.test/");
  await page.getByRole("button", { name: "Tạo tài khoản NV", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator('select[name="level"]').inputValue(), "2");
  assert.ok(await page.getByLabel("Ngày cấp tài khoản").inputValue());
  await page.getByLabel("Họ và tên").fill("Nhân viên kiểm thử");
  await page.getByLabel("Email đăng nhập", { exact: true }).fill("staff-test@example.invalid");
  await page.getByLabel("Số điện thoại").fill("0900000000");
  await page.locator('input[name="password"]').fill("ExamplePassword123!");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await page.getByRole("status").waitFor();
  assert.equal(payload.level, 2);
  assert.equal(payload.existing, false);
  assert.equal(await page.locator('input[name="password"]').inputValue(), "");
  await page.getByRole("checkbox").check();
  assert.equal(await page.locator('input[name="password"]').count(), 0);
  await page.getByRole("button", { name: "Đóng", exact: true }).last().click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  console.log("PASS: dialog, default role/date, create request, cleared password, existing-account mode, close");
} finally { await browser.close(); }
}
void main();
