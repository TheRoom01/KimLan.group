import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {
  decodeZdbMessagePayload,
  hasVerifiedZdbContent,
  zdbMessageBrowserScript,
} from "./zdb-message-decoder";
import { filterMessagesForPreview } from "./phase5-preview";

async function main() {
  const original = "  Studio/CS - 6tr9 - P.G01 + P.102\ntrống sẵn  ";
  assert.equal(decodeZdbMessagePayload(original).text, original);
  assert.equal(decodeZdbMessagePayload(JSON.stringify(original)).text, original);
  assert.equal(decodeZdbMessagePayload({ text: original }).text, original);
  assert.equal(decodeZdbMessagePayload('{"caption":"Studio - P01"}').text, "Studio - P01");
  for (const input of [null, undefined, [], 123, true, "null", "[]", "123", "true", "   "]) {
    assert.equal(decodeZdbMessagePayload(input).text, "");
  }
  assert.equal(decodeZdbMessagePayload('{not JSON').text, '{not JSON');
  assert.equal(hasVerifiedZdbContent({ contentSource: "zdb", text: "  " }), false);
  assert.equal(hasVerifiedZdbContent({ contentSource: "dom", text: original }), false);
  assert.equal(hasVerifiedZdbContent({
    contentSource: "dom",
    text: original,
    domHydration: { verifiedById: true },
  }), true);
  assert.equal(hasVerifiedZdbContent({
    contentSource: "dom",
    text: original,
    domHydration: { verifiedById: false },
  }), false);
  assert.equal(hasVerifiedZdbContent({ contentSource: "zdb", imageUrls: [""] }), false);

  // Execute the production functions/block, not a second implementation of extraction.
  // This VM has no DOM snapshot, browser, network, or real IndexedDB/profile.
  const readerPath = path.join(process.cwd(), "tools/zalo-reader/zalo-reader.before-semantic-parser.ts");
  const source = fs.readFileSync(readerPath, "utf8");
  const ast = ts.createSourceFile(readerPath, source, ts.ScriptTarget.Latest, true);
  const names = new Set([
    "safeJsonParse", "collectUrlEntries", "sanitizeVideoDebug",
    "isLikelyEncryptedMessageText", "extractDecodedZdbContent",
  ]);
  const functions: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) {
      functions.push(node.getText(ast));
      names.delete(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(names.size, 0, "all extraction functions are found in the running Reader");
  assert.ok(source.includes("await page.evaluate(zdbMessageBrowserScript())"));
  assert.ok(source.includes("const zdbPayload = zdbTools.decodeZdbMessagePayload(value.message)"));
  assert.ok(source.includes("messagesInWindow.filter(hasVerifiedZdbContent)"));
  assert.ok(source.includes("const searchDatabaseNames = strictPreviewTimestamps ? [] :"));
  const start = source.indexOf("        const contentEnrichment = {");
  const end = source.indexOf("         * BỔ SUNG NỘI DUNG TỪ DOM", start);
  const block = source.slice(start, source.lastIndexOf("        /**", end));
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(block, /domMessageSnapshot|idx_queue|sidxStore/);

  const groupId = "g1986619726266954037";
  const t0 = Date.UTC(2026, 9, 28, 11);
  const record = (msgId: string, message: unknown, extra: Record<string, unknown> = {}) => ({
    msgId, cliMsgId: `client-${msgId}`, msgType: 1, message,
    sendDttm: String(t0), serverTime: String(t0), toUid: groupId,
    fromUid: "fixture-sender", dName: "Fixture", ...extra,
  });
  const records = [
    record("plain", original),
    record("json", JSON.stringify({ text: "1PN/BC/1PB - 10tr - P.201" })),
    record("object", { content: "Studio - P04 - Lầu 2" }),
    record("fallback", "Studio - 9tr - P03"),
    record("empty", ""),
    record("opaque", "A".repeat(32)),
    record("unsupported", '{"unknown":"never invent text"}'),
    record("wrong-group", "Do not import", { toUid: "g999999999" }),
    record("bad-time", "Do not import", { serverTime: String(t0 + 1) }),
    record("old", "Outside window", { sendDttm: String(t0 - 86400001), serverTime: String(t0 - 86400001) }),
    record("photo", JSON.stringify({ oriUrl: "https://images.invalid/fixture.jpg" }), { msgType: 2 }),
    record("video", JSON.stringify({ videoUrl: "https://videos.invalid/fixture.mp4" }), { msgType: 18 }),
  ];
  const timeline = [...records.map((value) => ({
    msgId: value.msgId === "fallback" ? "missing-primary" : value.msgId,
    cliMsgId: value.cliMsgId, text: "", imageUrls: [], videoUrls: [], videoThumbUrls: [],
    // A failed lookup must clear even pre-existing provenance.
    contentSource: "zdb",
  })), { msgId: "missing", cliMsgId: "missing-client", text: "", contentSource: "zdb" }];
  const calls: string[] = [];
  const db = {
    objectStoreNames: { contains: (name: string) => name === "message" },
    transaction(name: string, mode: string) {
      assert.equal(name, "message");
      assert.equal(mode, "readonly");
      let used = false;
      return { objectStore(storeName: string) {
        assert.equal(storeName, "message");
        const get = (key: string, field: "msgId" | "cliMsgId") => {
          assert.equal(used, false, "each async lookup creates a fresh transaction");
          used = true;
          calls.push(`${field}:${key}`);
          const request: any = {};
          queueMicrotask(() => {
            request.result = records.find((value) => value[field] === key);
            request.onsuccess();
          });
          return request;
        };
        return {
          get: (key: string) => get(key, "msgId"),
          indexNames: { contains: (indexName: string) => indexName === "cliMsgIdIndex" },
          index(indexName: string) {
            assert.equal(indexName, "cliMsgIdIndex");
            return { get: (key: string) => get(key, "cliMsgId") };
          },
        };
      } };
    },
  };
  const context = vm.createContext({
    __name: Object, groupMessages: timeline, selectedDb: db,
    bestCandidate: { messageStoreName: "message", databaseName: "zdb_fixture", groupId },
  });
  vm.runInContext(zdbMessageBrowserScript(), context);
  const compiled = ts.transpileModule(`(async () => {
    const zdbTools = globalThis.__zaloZdbMessageTools;
    ${functions.join("\n")}
    ${block}
    return { messages: groupMessages, stats: contentEnrichment };
  })()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = await vm.runInContext(compiled, context);
  assert.equal(result.stats.requestedCount, 13);
  assert.equal(result.stats.matchedByMsgIdCount, 11);
  assert.equal(result.stats.matchedByCliMsgIdCount, 1);
  assert.equal(result.stats.notFoundCount, 1);
  assert.equal(result.stats.emptyContentCount, 1);
  assert.equal(result.stats.rejectedContentCount, 2);
  assert.equal(result.stats.wrongGroupCount, 1);
  assert.equal(result.stats.invalidTimestampCount, 1);
  assert.equal(result.stats.decodedTextCount, 5);
  assert.equal(result.stats.decodedImageCount, 1);
  assert.equal(result.stats.decodedVideoCount, 1);
  assert.equal(result.stats.lookupErrorCount, 0);
  assert.ok(calls.indexOf("msgId:missing-primary") < calls.indexOf("cliMsgId:client-fallback"));
  assert.equal(calls.includes("cliMsgId:plain"), false, "never treat msgId as cliMsgId");
  assert.equal(result.messages[0].text, original, "source text stays unchanged");
  assert.equal(result.messages[3].msgId, "fallback", "fallback keeps canonical record identity");
  const filtered = filterMessagesForPreview(result.messages, t0);
  const parsed = filtered.messages.filter(hasVerifiedZdbContent);
  assert.equal(filtered.messages.length, 9);
  assert.equal(parsed.length, 6, "only verified in-window text/media reach staging parser");
  assert.deepEqual(Array.from(parsed, (item: any) => item.msgId), ["plain", "json", "object", "fallback", "photo", "video"]);
  // Missing index, request error and transaction abort must fail closed, not hang.
  for (const failure of ["missing-index", "request-error", "transaction-error"]) {
    const failedMessages = [{ msgId: "missing", cliMsgId: "client-fallback", text: "stale", contentSource: "zdb" }];
    const failedDb = {
      objectStoreNames: { contains: () => true },
      transaction() {
        if (failure === "transaction-error") throw new Error("fixture transaction unavailable");
        return { objectStore() {
          const get = () => {
            const request: any = {};
            queueMicrotask(() => {
              if (failure === "request-error") request.onerror();
              else { request.result = null; request.onsuccess(); }
            });
            return request;
          };
          return { get, indexNames: { contains: () => failure !== "missing-index" }, index: () => ({ get }) };
        } };
      },
    };
    const failedContext = vm.createContext({
      __name: Object, groupMessages: failedMessages, selectedDb: failedDb,
      bestCandidate: { messageStoreName: "message", databaseName: "zdb_fixture", groupId },
    });
    vm.runInContext(zdbMessageBrowserScript(), failedContext);
    const failed = await vm.runInContext(compiled, failedContext);
    assert.equal(failed.stats.notFoundCount, 1);
    assert.equal(failed.messages.filter(hasVerifiedZdbContent).length, 0);
    assert.equal(failed.stats.lookupErrorCount, failure === "missing-index" ? 0 : 2);
  }
  console.log("ZDB runtime extraction regression: PASS (13 fixture records, no DOM/network/profile)");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

