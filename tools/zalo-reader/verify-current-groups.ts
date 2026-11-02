import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  process.env.ZALO_READER_EMBEDDED = "1";
  const { groupIdentityDiagnostics: helpers } = await import("./zalo-reader.before-semantic-parser");
  const { zdbMessageBrowserScript } = await import("./parsers/zdb-message-decoder");
  const config = { ...JSON.parse(fs.readFileSync("tools/zalo-reader/config.json", "utf8")), officialReader: true };
  const groups = JSON.parse(fs.readFileSync("tools/zalo-reader/production.config.json", "utf8")).groups;
  const context = await chromium.launchPersistentContext(path.resolve(".zalo-reader/profile"), { headless: false, viewport: { width: 1400, height: 900 } });
  const results = [];
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://chat.zalo.me", { waitUntil: "domcontentloaded" });
    await helpers.waitForPreviewLogin(page, config);
    for (const group of groups) {
      await helpers.openGroup(page, group.name, config);
      await page.waitForTimeout(2500);
      const visible = await helpers.captureVisibleDomMessages(page, config);
      const ids = [...new Set(visible.flatMap(item => item.idCandidates))];
      await page.evaluate("globalThis.__name = Object");
      await page.evaluate(zdbMessageBrowserScript());
      const scope = await page.evaluate(async ids => {
        const request = (r: IDBRequest): Promise<any> => new Promise((resolve,reject) => { r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
        const matches: Record<string, number> = {};
        const schemas = [];
        for (const info of await indexedDB.databases()) {
          if (!/^zdb_/.test(info.name || "")) continue;
          const db = await request(indexedDB.open(info.name!));
          try {
            if (!db.objectStoreNames.contains("message")) continue;
            const store = () => db.transaction("message","readonly").objectStore("message");
            schemas.push({ count: await request(store().count()), keyPath: store().keyPath });
            for (const id of ids.slice(0, 200)) {
              let record = await request(store().get(id));
              if (!record && store().indexNames.contains("cliMsgIdIndex")) record = await request(store().index("cliMsgIdIndex").get(id));
              if (record && /^g\d{10,30}$/.test(String(record.toUid || ""))) matches[record.toUid] = (matches[record.toUid] || 0) + 1;
            }
          } finally { db.close(); }
        }
        return { matches, schemas, visibleIdCount: ids.length };
      }, ids);
      results.push({ key: group.key, name: group.name, exactResultCount: config.officialExactResultCount, ...scope });
    }
    fs.writeFileSync(".zalo-reader/current-group-verification.json", JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
