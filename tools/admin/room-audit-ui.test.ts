import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createElement, type AnchorHTMLAttributes, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { build } from "esbuild";
import { chromium } from "playwright";

const path = "app/reports/room-history";
const roomId = "a4d61f73-9338-485e-8fe3-3382ef4fd60a";
const eventId = "fcd51637-643b-4f98-ae39-35a389f40d49";
const event = {
  id: eventId, room_id: roomId, entity: "rooms", action: "UPDATE_ROOM", source: "admin",
  actor_role: "admin_l1", actor_display_name_snapshot: "Admin A", room_reference: { code: "P101" },
  operation_id: "1", created_at: "2026-11-07T20:00:00Z", changed_fields: ["price"],
  before_data: { price: 100 }, after_data: { price: 200 },
};

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(`${path}/${file}`, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, { module: loadedModule, exports: loadedModule.exports, URLSearchParams, require(name: string) {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } });
  return loadedModule.exports as T;
}

async function checkTheme(html: string) {
  const mocks: Record<string, string> = {
    "next/navigation": `export const usePathname = () => "/"; export const useRouter = () => ({});`,
    "@/lib/analytics/client": `export const trackVisitorEvent = () => {};`,
    "@/lib/zalo-import/access": `export const canAccessZaloImports = () => true;`,
    "@/lib/supabase": `export const supabase = {
      auth: { getSession: async () => ({data: {session: {user: {id: "fixture"}}}}),
        onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}}) },
      rpc: async () => ({data: 1})
    };`,
  };
  const script = (await build({
    stdin: { contents: `import AuthControls from "./components/AuthControls"; import { createRoot } from "react-dom/client";
      createRoot(document.getElementById("fixture")).render(<AuthControls />);`, loader: "tsx", resolveDir: process.cwd() },
    jsx: "automatic", bundle: true, write: false, platform: "browser", define: { "process.env": "{}" },
    plugins: [{ name: "offline-auth", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path] }));
    } }],
  })).outputFiles[0].text;
  const css = readFileSync("app/public-theme.css", "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(8000);
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/*", route => {
      const url = route.request().url();
      if (url === "http://offline.test/") return route.fulfill({ contentType: "text/html", body:
        `<!doctype html><html data-room-theme="light" data-home-hydrated="true"><meta charset="utf-8"><style>${css}</style><div id="auth-anchor"></div><div id="fixture"></div>${html}<script src="/auth.js"></script></html>` });
      if (url === "http://offline.test/auth.js") return route.fulfill({ contentType: "text/javascript", body: script });
      if (url === "http://offline.test/api/device/list") return route.fulfill({ json: { ok: true, devices: [{ id: "fixture-device", platform: "Windows" }] } });
      return route.abort();
    });
    await page.goto("http://offline.test/");
    assert.deepEqual(pageErrors, []);
    await page.getByRole("button", { name: /Tài khoản/ }).click();
    const menu = page.locator('[data-public-auth-menu="true"]');
    await menu.getByText("Máy tính Windows", { exact: true }).waitFor();
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(value => { document.documentElement.dataset.roomTheme = value; }, theme);
      const light = theme === "light";
      const foreground = light ? "rgb(63, 53, 46)" : "rgb(255, 244, 229)";
      const background = light ? "rgb(255, 253, 250)" : "rgb(57, 37, 23)";
      for (const name of ["Thao tác", "Nguồn"]) {
        const select = page.getByRole("combobox", { name, exact: true });
        assert.equal(await select.evaluate(node => getComputedStyle(node).colorScheme), theme);
        const colors = await select.locator("option").evaluateAll(options => options.map(option => {
          const style = getComputedStyle(option);
          return [style.color, style.backgroundColor];
        }));
        assert.ok(colors.length > 1 && colors.every(pair => pair[0] === foreground && pair[1] === background), name);
      }
      assert.equal(await menu.evaluate(node => getComputedStyle(node).backgroundColor), background);
      for (const target of [menu.getByRole("link", { name: "Trang duyệt phòng" }), menu.getByText("Máy tính Windows", { exact: true })]) {
        assert.equal(await target.evaluate(node => getComputedStyle(node).color), foreground);
      }
      assert.equal(await menu.getByText("Thiết bị đang đăng nhập").evaluate(node => getComputedStyle(node).color),
        light ? "rgb(110, 96, 84)" : "rgb(220, 201, 183)");
    }
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    const action = page.getByRole("combobox", { name: "Thao tác", exact: true });
    await action.press("Home");
    await action.press("ArrowDown");
    assert.equal(await action.inputValue(), "CREATE_ROOM");
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
}

async function main() {
  let level = 0;
  let roomExists = true;
  let historyError = false;
  const calls: unknown[][] = [];
  const rpcCalls: string[] = [];
  const history = {
    then(resolve: (value: unknown) => void) {
      resolve({ data: historyError ? null : [event], count: 51, error: historyError });
    },
    ...Object.fromEntries(["select", "order", "range", "or", "eq", "ilike", "gte", "lte"].map(method => [method, (...args: unknown[]) => {
      calls.push([method, ...args]);
      return history;
    }])),
  };
  const dependencies = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props),
    "next/navigation": { redirect: (href: string) => { throw new Error(href); } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/rooms/cacheInvalidation": { invalidatePublicRoomCache: () => {} },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: level ? { id: "verified" } : null } }) },
      rpc: async (name: string) => {
        rpcCalls.push(name);
        if (name === "restore_room_audit_event_v1") return { error: { code: "40001" } };
        return { data: name === "get_my_admin_level" ? level : [{ total: 51 }] };
      },
      from: (table: string) => {
        calls.push(["from", table]);
        return table === "rooms" ? { select: () => ({ in: () => ({ data: roomExists ? [{ id: roomId }] : [] }) }) } : history;
      },
    }) },
    "./RestoreSubmit": () => createElement("button", null, "Xác nhận khôi phục"),
  };
  const actions = load<{ restoreRoomHistory(form: FormData): Promise<never> }>("actions.ts", dependencies);
  const { default: page } = load<{ default(props: { searchParams: Promise<Record<string, string>> }): Promise<ReactElement> }>("page.tsx", {
    ...dependencies, "./actions": { restoreRoomHistory: "/fixture-restore" },
  });
  const props = { searchParams: Promise.resolve({ page: "2", q: "P101,\"*", actor: "Admin A", source: "admin", action: "UPDATE_ROOM", from: "2026-11-08" }) };
  await assert.rejects(() => page(props), /auth=login/);
  level = 2;
  await assert.rejects(() => page(props), /\/admin/);
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("field", "price");
  await assert.rejects(() => actions.restoreRoomHistory(form), /\/admin/);
  assert.equal(calls.length, 0);
  assert.ok(!rpcCalls.includes("restore_room_audit_event_v1"));

  level = 1;
  const html = renderToStaticMarkup(await page(props));
  assert.match(html, /Trang 2 · 51 thao tác/);
  assert.match(html, /Giá sẽ đổi từ 200 về 100/);
  assert.match(html, /Xác nhận khôi phục/);
  assert.ok(html.includes(`/rooms/${roomId}`));
  assert.deepEqual(calls.find(([method]) => method === "range"), ["range", 20, 39]);
  assert.deepEqual(calls.find(([method]) => method === "gte"), ["gte", "created_at", "2026-11-08T00:00:00+07:00"]);
  assert.deepEqual(calls.find(([method]) => method === "ilike"), ["ilike", "actor_display_name_snapshot", "%Admin A%"]);
  assert.match(String(calls.find(([method]) => method === "or")?.[1]), /code\.ilike\."\*P101\*"/);
  await assert.rejects(() => actions.restoreRoomHistory(form), /result=conflict/);
  roomExists = false;
  const missing = renderToStaticMarkup(await page(props));
  assert.match(missing, /Không thể tạo lại từ lịch sử/);
  assert.doesNotMatch(missing, /Xác nhận khôi phục/);
  historyError = true;
  assert.match(renderToStaticMarkup(await page(props)), /Không tải được lịch sử thao tác/);
  await checkTheme(html);
  console.log("Offline room audit UI PASS: permissions, filters, restore, and light/dark colors for report controls and the Account menu");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
