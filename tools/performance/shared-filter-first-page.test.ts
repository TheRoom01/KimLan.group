import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { chromium } from "playwright";
import { renderToString } from "react-dom/server";

type Query = Record<string, string | number | string[] | null | undefined>;
const calls: { side: string; query: Query }[] = [];
const rooms = Array.from({ length: 65 }, (_, i) => ({
  id: `room-${i}`, room_code: `P${i}`, room_type: i < 20 ? "Studio" : "1PN",
  address: i < 20 ? "Đường mặc định" : "Hoàng Văn Thụ", district: i < 20 ? "3" : "1", ward: "17",
  price: i < 20 ? 2_000_000 : 5_000_000 + i * 1_000, status: i < 5 ? "Đã thuê" : "Đang trống",
  badges: i < 20 ? [] : ["featured"], updated_at: "2026-11-01T00:00:00.123456Z",
  created_at: "2026-10-01T00:00:00.123456Z", room_detail: { has_balcony: i >= 20, has_elevator: true, allow_cat: true },
}));
const ids = (from: number, to: number) => rooms.slice(from, to).map(room => room.id);
const predicate = (values: Query[string], value: string) => !Array.isArray(values) || values.includes(value);
function rpc(side: string, name: string, query: Query = {}, uid?: string) {
  if (name === "start_anon_session") return { data: "fixture-session", error: null };
  if (name === "get_my_admin_level") return { data: uid === "fixture-member" ? 0 : 1, error: null };
  if (name !== "fetch_rooms_cursor_full_v1") return { data: null, error: null };
  calls.push({ side, query });
  const tokens = Array.isArray(query.p_statuses) ? query.p_statuses : [];
  const statuses = tokens.filter(token => !token.startsWith("__"));
  const result = rooms.filter(room =>
    (typeof query.p_min_price !== "number" || room.price >= query.p_min_price) &&
    (typeof query.p_max_price !== "number" || room.price <= query.p_max_price) &&
    predicate(query.p_districts, room.district) && predicate(query.p_room_types, room.room_type) &&
    (typeof query.p_search !== "string" || room.address.toLowerCase().includes(query.p_search)) &&
    (!statuses.length || statuses.includes(room.status)) &&
    tokens.filter(token => token.startsWith("__badge:")).every(token => room.badges.includes(token.slice(8))) &&
    (!tokens.includes("__amenity:balcony") || room.room_detail.has_balcony)
  );
  if (query.p_sort === "price_desc") result.reverse();
  const offset = query.p_cursor ? result.findIndex(room => room.id === query.p_cursor) + 1 : 0;
  assert.ok(!query.p_cursor || offset > 0, "cursor belongs to the same filtered result");
  const data = result.slice(offset, offset + Number(query.p_limit));
  const last = data.at(-1);
  const nextCursor = last && result.length > offset + data.length
    ? { id: last.id, created_at: last.created_at, updated_at: last.updated_at, search_score: 0 } : null;
  return { data: { data, total_count: result.length, nextCursor }, error: null };
}

const mocks: Record<string, string> = {
  "next/navigation": `export const usePathname=()=>"/";export const useRouter=()=>({back:()=>history.back(),push:u=>location.assign(u)})`,
  "next/link": `import React from "react";export default React.forwardRef(({href,children,prefetch,scroll,...p},ref)=><a {...p} href={href} ref={ref}>{children}</a>)`,
  "next/dynamic": `export default()=>()=>null`,
  "next/headers": `export const cookies=async()=>({getAll:()=>globalThis.fixtureUser?[{name:"sb-fixture-auth-token"}]:[]})`,
  "next/cache": `const results=new Map;export const unstable_cache=(fn,key)=>async()=>{const k=JSON.stringify(key);if(!results.has(k))results.set(k,fn());return results.get(k)}`,
  "server-only": "",
  "@supabase/supabase-js": `export const createClient=()=>({rpc:(...args)=>globalThis.fixtureRpc("ssr",...args)})`,
  "@/lib/supabase/server": `export const createSupabaseServerClient=async()=>{const user=globalThis.fixtureUser;return{auth:{getUser:async()=>({data:{user}})},rpc:(name,query)=>globalThis.fixtureRpc("auth-ssr",name,query,user?.id)}}`,
  "@/lib/analytics/client": `export const trackVisitorEvent=()=>{}`,
  "@/components/LogoIntroButton": `export default()=>null`,
  "@/components/HeaderNotifications": `export default()=>null`,
};

async function main() {
  const fixture = globalThis as typeof globalThis & { fixtureRpc: typeof rpc; fixtureUser: { id: string } | null };
  fixture.fixtureRpc = rpc;
  const bundle = async (platform: "node" | "browser", contents: string) => (await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform,
    jsx: "automatic", external: platform === "node" ? ["react", "react-dom"] : [],
    define: { "process.env": "{}", "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED": '"false"' },
    loader: { ".css": "empty", ".module.css": "empty" },
    plugins: [{ name: "offline-home", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.path in mocks || /^(?:@\/lib\/supabase|\.\/supabase)$/.test(args.path)) return { path: args.path, namespace: "fixture" };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        loader: "tsx", resolveDir: process.cwd(), contents: mocks[args.path] ?? `
          const user=()=>typeof window==='undefined'?globalThis.fixtureUser:window.fixtureUser;
          export const supabase={auth:{getSession:async()=>({data:{session:user()?{user:user()}:null}}),onAuthStateChange:cb=>{
            if(typeof window!=='undefined')window.fixtureAuth=next=>{window.fixtureUser=next;cb(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null)};
            return {data:{subscription:{unsubscribe(){}}}}}},rpc:async(name,query)=>{
            const res=await fetch('/fixture-rpc',{method:'POST',body:JSON.stringify({name,query,uid:user()?.id})});return res.json();
          }};`,
      }));
    } }],
  })).outputFiles[0].text;
  const [serverSource, browserSource] = await Promise.all([
    bundle("node", `export { default } from "./app/page";`),
    bundle("browser", `import {hydrateRoot,createRoot} from "react-dom/client";import Home from "./app/HomeClient";
      const root=document.getElementById('root');const content=<Home {...window.fixtureProps}/>;
      if(root.hasChildNodes())hydrateRoot(root,content);else createRoot(root).render(content);`),
  ]);
  const loaded = { exports: {} };
  const loadDependency = createRequire(`${process.cwd()}/package.json`);
  new Function("module", "exports", "require", serverSource)(loaded, loaded.exports, (name: string) =>
    name === "react" ? { ...loadDependency(name), cache: (fn: unknown) => fn, useLayoutEffect: () => {} } : loadDependency(name));
  const home = (loaded.exports as typeof import("../../app/page")).default;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://offline.test");
    try {
      if (url.pathname === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(browserSource); return; }
      if (url.pathname === "/api/vip/validate") {
        res.end(JSON.stringify({ valid: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), tokenHash: "fixture-vip" }));
        return;
      }
      if (url.pathname === "/fixture-rpc") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { name, query, uid } = JSON.parse(Buffer.concat(chunks).toString());
        const result = rpc("browser", name, query, uid);
        if (query?.p_search === "đường mặc định") await new Promise(resolve => setTimeout(resolve, 650));
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname !== "/") { res.statusCode = 404; res.end(); return; }
      const signedIn = url.searchParams.get("signedIn");
      fixture.fixtureUser = signedIn ? { id: `fixture-${signedIn}` } : null;
      const initialUser = fixture.fixtureUser;
      const searchParams = Object.fromEntries(url.searchParams);
      const result = await home({ searchParams: Promise.resolve(url.searchParams.has("mismatch") ? {} : searchParams) });
      const props = result.props;
      const markup = url.searchParams.has("mismatch") ? "" : renderToString(result);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><meta charset="utf-8"><div id="root">${markup}</div><script>window.fixtureProps=${JSON.stringify(props)};window.fixtureUser=${JSON.stringify(initialUser)};</script><script defer src="/fixture.js"></script>`);
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await chromium.launch({ headless: true });
  const openContext = async (options?: import("playwright").BrowserContextOptions) => {
    const context = await browser.newContext(options);
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    return context;
  };
  const browserErrors: string[] = [];
  const readIds = (page: import("playwright").Page) => page.locator('.home-room-list a[href^="/rooms/"]').evaluateAll(links =>
    [...new Set(links.map(link => link.getAttribute("href")!.split("?")[0].slice(7)))]);
  try {
    const noScript = await openContext({ javaScriptEnabled: false });
    const htmlPage = await noScript.newPage();
    const ssrCases: [Record<string, string>, string[]][] = [
      [{ max: "30000000" }, ids(20, 40)],
      [{ min: "12000000", max: "3000000" }, ids(20, 40)],
      [{ d: "Quận 1" }, ids(20, 40)],
      [{ t: "1 Phòng ngủ" }, ids(20, 40)],
      [{ st: "Đã thuê" }, ids(0, 5)],
      [{ features: "balcony" }, ids(20, 40)],
      [{ badge: "featured" }, ids(20, 40)],
      [{ s: "price_desc" }, ids(45, 65).reverse()],
      [{ q: "Hoàng Văn Thụ" }, ids(20, 40)],
      [{ q: "Không có kết quả" }, []],
      [{ utm_source: "shared" }, ids(0, 20)],
    ];
    for (const [params, expected] of ssrCases) {
      await htmlPage.goto(`${origin}/?${new URLSearchParams(params)}`);
      assert.deepEqual(await readIds(htmlPage), expected, `SSR HTML for ${JSON.stringify(params)}`);
    }
    await noScript.close();

    for (const signedIn of [null, "admin", "member"]) {
      const context = await openContext();
      const page = await context.newPage();
      page.on("pageerror", error => { browserErrors.push(error.message); console.error(error.message); });
      const query = new URLSearchParams({ d: "Quận 1", rt: "1 Phòng ngủ", q: "Hoàng Văn Thụ", features: "balcony", badge: "featured", st: "Đang trống", s: "price_asc", min: "3000000", max: "12000000" });
      if (signedIn) query.set("signedIn", signedIn);
      const start = calls.length;
      const response = await page.goto(`${origin}/?${query}`);
      assert.equal(response?.status(), 200, response?.status() === 200 ? "" : await page.locator("body").innerText());
      await page.locator('html[data-home-hydrated="true"]').waitFor({ state: "attached" });
      assert.deepEqual(await readIds(page), ids(20, 40));
      assert.match(await page.locator("body").innerText(), /45/);
      await page.waitForTimeout(330);
      assert.equal(calls.slice(start).filter(call => call.side === "browser").length, 0, "matched SSR has no duplicate listing request");
      await page.getByRole("button", { name: "Sau →", exact: true }).click();
      await page.locator('a[href^="/rooms/room-40?"]').first().waitFor({ state: "attached" });
      assert.deepEqual(await readIds(page), ids(40, 60));
      const ssr = (calls.slice(start).find(call => call.side !== "browser") ??
        calls.find(call => call.side === "ssr" && call.query.p_search === "hoàng văn thụ" && call.query.p_min_price === 3_000_000))!.query;
      const next = calls.slice(start).find(call => call.side === "browser")!.query;
      assert.equal(next.p_role, signedIn === "admin" ? 1 : 0);
      assert.equal(next.p_cursor, "room-39");
      assert.equal(next.p_cursor_updated_at, "2026-11-01T00:00:00.123456Z");
      for (const key of ["p_search", "p_min_price", "p_max_price", "p_districts", "p_room_types", "p_statuses", "p_sort"]) assert.deepEqual(next[key], ssr[key], key);
      await page.reload();
      await page.locator('a[href^="/rooms/room-40?"]').first().waitFor({ state: "attached" });
      assert.deepEqual(await readIds(page), ids(40, 60), "reload the existing cursor with the same filter");
      await page.goto(`${origin}/?${query}`);
      await page.reload();
      await page.locator('html[data-home-hydrated="true"]').waitFor({ state: "attached" });
      assert.deepEqual(await readIds(page), ids(20, 40));
      await context.close();
    }
    const page = await (await openContext()).newPage();
    await page.addInitScript(staleRooms => {
      const observed = window as typeof window & { sawDefaultRooms?: boolean };
      new MutationObserver(() => {
        if (document.querySelector('.home-room-list a[href^="/rooms/room-0?"]')) observed.sawDefaultRooms = true;
      }).observe(document, { childList: true, subtree: true });
      if (location.search.includes("mismatch=1")) sessionStorage.setItem("HOME_BACK_SNAPSHOT_V2", JSON.stringify({
        qs: location.search.slice(1), pages: [staleRooms], pageIndex: 0, displayPageIndex: 0, ts: Date.now(),
      }));
    }, rooms.slice(0, 20));
    await page.goto(`${origin}/?max=30000000&mismatch=1`);
    await page.locator('a[href^="/rooms/room-20?"]').first().waitFor({ state: "attached" });
    assert.deepEqual(await readIds(page), ids(20, 40), "mismatched initial seed must refetch the URL query");
    assert.ok(await page.evaluate(() => !(window as typeof window & { sawDefaultRooms?: boolean }).sawDefaultRooms));

    await page.goto(`${origin}/`);
    const keyword = page.getByPlaceholder(/^Tìm đường/);
    await keyword.fill("Đường mặc định");
    await page.waitForFunction(() => new URLSearchParams(location.search).get("q") === "Đường mặc định");
    await keyword.fill("Hoàng Văn Thụ");
    await page.locator('a[href^="/rooms/room-20?"]').first().waitFor({ state: "attached" });
    await page.waitForTimeout(450);
    assert.deepEqual(await readIds(page), ids(20, 40), "a stale keyword response cannot replace the new filter");
    const sharedUrl = page.url();
    assert.equal(new URL(sharedUrl).searchParams.get("q"), "Hoàng Văn Thụ");
    const sharedContext = await openContext();
    const shared = await sharedContext.newPage();
    const sharedResponse = await shared.goto(sharedUrl);
    assert.equal(sharedResponse?.status(), 200, sharedResponse?.status() === 200 ? "" : await shared.locator("body").innerText());
    await shared.locator('a[href^="/rooms/room-20?"]').first().waitFor({ state: "attached" });
    assert.deepEqual(await readIds(shared), ids(20, 40), "filter changed on Home and opened in a new browser context");
    await sharedContext.close();

    await page.getByRole("button", { name: "Sau →", exact: true }).click();
    await page.locator('a[href^="/rooms/room-40?"]').first().waitFor({ state: "attached" });
    const authCalls = calls.length;
    await page.evaluate(() => (window as typeof window & { fixtureAuth(uid: { id: string }): void }).fixtureAuth({ id: "fixture-admin" }));
    await page.locator('a[href^="/rooms/room-20?"]').first().waitFor({ state: "attached" });
    const afterLogin = calls.slice(authCalls).find(call => call.side === "browser" && !call.query.p_cursor);
    assert.equal(afterLogin?.query.p_role, 1);
    assert.equal(afterLogin?.query.p_search, "hoàng văn thụ");
    assert.equal(new URL(page.url()).searchParams.has("c"), false);

    const beforeVip = calls.length;
    const vipPage = await (await openContext()).newPage();
    await Promise.all([
      vipPage.waitForResponse(response => response.url().endsWith("/fixture-rpc") &&
        response.request().postDataJSON()?.query?.p_vip_token_hash === "fixture-vip"),
      vipPage.goto(`${origin}/?${new URLSearchParams({ d: "Quận 1", vip: "fixture-token" })}`),
    ]);
    const vip = calls.slice(beforeVip).find(call => call.query.p_vip_token_hash === "fixture-vip");
    assert.deepEqual(vip?.query.p_districts, ["1", "Quận 1"]);
    assert.equal(vip?.query.p_role, 0);
    assert.deepEqual(browserErrors, []);
    console.log("Shared filters PASS: SSR HTML, clean Anonymous, signed in, reload, URL mismatch, matching total/keyset pagination, sharing and stale/auth requests");
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
