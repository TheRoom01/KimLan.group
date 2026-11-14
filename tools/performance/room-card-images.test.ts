import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

async function main() {
  const root = process.cwd();
  const image = fs.readFileSync("public/no-image.webp");
  const cssPath = ".next/dev/static/css/app/layout.css";
  const productionCss = ".next/static/css";
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : fs.readdirSync(productionCss).filter(name => name.endsWith(".css")).map(name => fs.readFileSync(path.join(productionCss, name), "utf8")).join("\n");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const optimize of [false, true]) {
      const mocks: Record<string, string> = {
        "next/link": "import React from 'react';export default({href,children,onClick})=><a href={href} onClick={onClick}>{children}</a>;",
        "next/dynamic": "export default()=>()=>null;",
        "@/lib/supabase": "export const supabase={rpc:async()=>({data:null,error:null})};",
      };
      const script = (await build({
        stdin: { resolveDir: root, loader: "tsx", contents: `
          import React,{useState}from'react';import{createRoot}from'react-dom/client';import Card from'./components/RoomCard';
          const urls=n=>[1,2,3].map(i=>'https://cdn.canhodichvu.pro/'+n+i+'.webp');
          const base={id:'first',room_type:'Studio',price:5e6,has_video:true,thumb_url:'https://cdn.canhodichvu.pro/stale.webp',status:'Đang trống',address:'Đường mẫu',image_count:3,image_urls:urls('photo')};
          function App(){const[room,S]=useState(base);window.replaceImages=prefix=>S({...base,image_urls:urls(prefix)});return <div className='home-redesign'><div id='first' style={{width:400}}><Card room={room} index={0}/></div><div style={{height:20000}}/><div id='late' style={{width:400}}><Card room={{...base,id:'late',image_urls:urls('late')}} index={1}/></div></div>};
          createRoot(document.getElementById('root')).render(<App/>);
        ` },
        bundle: true, write: false, platform: "browser", logLevel: "silent", loader: { ".module.css": "empty" },
        define: { "process.env": "{}", "process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL": JSON.stringify("https://cdn.canhodichvu.pro"), "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_ROOM_CARD_IMAGE_OPTIMIZATION": JSON.stringify(String(optimize)) },
        plugins: [{ name: "offline", setup(builder) {
          builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
          builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
        } }],
      })).outputFiles[0].text;
      const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
      const errors: string[] = [];
      const requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = route.request().url();
        requests.push(url);
        if (url.includes("/_next/image?")) return route.fulfill({ status: 402, contentType: "text/plain", body: "OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED" });
        if (url.includes("/missing")) return route.fulfill({ status: 404, body: "Missing original" });
        return route.fulfill({ contentType: "image/webp", body: image, headers: { "cache-control": "public,max-age=31536000,immutable" } });
      });
      await page.setContent(`<html><head><base href="https://offline.test/"><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`);
      const loaded = () => page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("#first .home-room-gallery img")].length === 3 && [...document.querySelectorAll<HTMLImageElement>("#first .home-room-gallery img")].every(img => img.complete && img.naturalWidth > 0));
      await loaded();
      const sources = () => page.locator("#first .home-room-gallery img").evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).currentSrc));
      assert.deepEqual(await sources(), [1,2,3].map(i => `https://cdn.canhodichvu.pro/photo${i}.webp`), "valid originals remain in order, even when optimizer returns 402");
      assert.equal(requests.some(url => /thumb[.]webp|stale[.]webp/.test(url)), false, "video rooms ignore stale thumbnails");
      const optimizedRequests = requests.filter(url => url.includes("/_next/image?"));
      assert(optimize ? optimizedRequests.length >= 3 && optimizedRequests.length <= 6 : optimizedRequests.length === 0, "default skips optimizer; opt-in srcset failures have bounded retries");
      assert.equal(requests.filter(url => url.includes("/late")).length, 0, "distant card images stay lazy");
      const geometry = await page.locator("#first .home-room-gallery").boundingBox();
      await page.evaluate(() => (window as unknown as { replaceImages: (prefix: string) => void }).replaceImages("missing"));
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("#first .home-room-gallery img")].every(img => img.currentSrc.endsWith("/no-image.webp") && img.complete && img.naturalWidth > 0));
      await page.waitForTimeout(100);
      const count = requests.length;
      await page.waitForTimeout(300);
      assert.equal(requests.length, count, "missing originals cannot create a retry loop");
      assert.deepEqual(await page.locator("#first .home-room-gallery").boundingBox(), geometry, "loading/errors do not shift card layout");
      await page.evaluate(() => (window as unknown as { replaceImages: (prefix: string) => void }).replaceImages("replacement"));
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("#first .home-room-gallery img")].every(img => img.currentSrc.includes("/replacement")));
      await loaded();
      assert.deepEqual(await sources(), [1,2,3].map(i => `https://cdn.canhodichvu.pro/replacement${i}.webp`), "changed sources recover without remounting the room");
      await page.locator("#late").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("#late .home-room-gallery img")].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(errors.length, 0, errors.join("\n"));
      await page.close();
    }
    console.log("PASS: direct cached CDN default, optimizer 402 -> same original, missing files -> bounded placeholder, source recovery, lazy offscreen images and stable layout (offline).");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
