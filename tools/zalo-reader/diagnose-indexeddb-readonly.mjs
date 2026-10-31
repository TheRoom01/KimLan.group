import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const profileDir = path.join(repoRoot, ".zalo-reader", "profile");
const diagnosticsDir = path.join(repoRoot, ".zalo-reader", "diagnostics");
const targetZdbName = "zdb_398134954462017570";
const expectedSidxName = "sidx_398134954462017570";

function fail(message) {
  console.error(`[IndexedDB diagnostic stopped] ${message}`);
  process.exitCode = 1;
}

function assertNoChromeProcesses() {
  if (process.platform !== "win32") {
    throw new Error("This diagnostic currently supports the Windows Chrome profile only.");
  }

  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$count = @(Get-Process chrome -ErrorAction SilentlyContinue).Count; [Console]::Out.Write([string]$count)",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const processCount = Number(output.trim());
  if (!Number.isInteger(processCount)) {
    throw new Error("Không xác minh được trạng thái Chrome; từ chối mở profile.");
  }
  if (processCount > 0) {
    throw new Error(
      `Chrome đang có ${processCount} tiến trình. Đóng Chrome trước; script không mở, xóa hoặc sao chép profile đang được sử dụng.`,
    );
  }

  const lockFile = path.join(profileDir, "lockfile");
  if (fs.existsSync(lockFile)) {
    throw new Error(
      "Profile còn lockfile Chrome. Đóng Chrome và xác minh tiến trình đã thoát; script không xóa lockfile hoặc mở profile đang bị khóa.",
    );
  }

  const cdpPortFile = path.join(profileDir, "DevToolsActivePort");
  if (fs.existsSync(cdpPortFile)) {
    throw new Error(
      "Profile còn DevToolsActivePort; từ chối mở thêm browser context để tránh cạnh tranh profile.",
    );
  }
}

async function main() {
  if (!fs.existsSync(profileDir)) {
    throw new Error(`Không tìm thấy Chrome profile: ${profileDir}`);
  }

  assertNoChromeProcesses();

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      serviceWorkers: "block",
      viewport: { width: 900, height: 700 },
      args: [
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
        "--disable-default-apps",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    // No Zalo application code or network request is allowed. A synthetic
    // same-origin document is used only to access the existing IndexedDB.
    await context.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        requestUrl.origin === "https://chat.zalo.me" &&
        route.request().method() === "GET"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><meta charset=utf-8><title>Local IndexedDB diagnostic</title>",
        });
        return;
      }
      await route.abort("blockedbyclient");
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://chat.zalo.me/", { waitUntil: "domcontentloaded" });

    if (process.argv.includes("--payload-structure")) {
      const summary = await page.evaluate(async ({ databaseName, groupId, t0 }) => {
        // Only structural metadata leaves this realm. No record/ID/text samples.
        const available = await indexedDB.databases();
        if (!available.some((db) => db.name === databaseName)) throw new Error("Target database unavailable");
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error("Creation blocked")); };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error("Cannot open target database"));
        });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction("message", "readonly");
            const store = tx.objectStore("message");
            if (!store.indexNames.contains("userId_sendDttm_msgId")) {
              reject(new Error("Group index unavailable; refusing full-store scan"));
              return;
            }
            const counts = new Map();
            let inspected = 0;
            const type = (v) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
            const shape = (v, depth = 0) => {
              if (!v || typeof v !== "object" || depth >= 4) return type(v);
              if (Array.isArray(v)) return { array: v.slice(0, 3).map((x) => shape(x, depth + 1)) };
              const output = {};
              for (const key of Object.keys(v).sort().slice(0, 60)) {
                // Exclude dynamic keys and never descend into credential fields.
                if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,39}$/.test(key)) continue;
                output[key] = /token|secret|password|cookie|authorization|key/i.test(key)
                  ? type(v[key]) : shape(v[key], depth + 1);
              }
              return output;
            };
            const request = store.index("userId_sendDttm_msgId").openCursor(
              IDBKeyRange.bound([groupId], [groupId, []]), "prev",
            );
            request.onerror = () => reject(new Error("Group cursor failed"));
            tx.onabort = () => reject(new Error("Readonly transaction aborted"));
            tx.oncomplete = () => resolve({ inspected, schemas: Array.from(counts.values()) });
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor || inspected >= 300) return;
              const row = cursor.value;
              if (String(row.toUid || "") === groupId) {
                const times = [row.sendDttm, row.serverTime].filter((x) => x != null && x !== "" && x !== 0 && x !== "0");
                const valid = times.length && times.every((x) => /^\d{13}$/.test(String(x)) && Number(x) === Number(times[0]));
                if (valid && Number(times[0]) >= t0 - 86400000 && Number(times[0]) <= t0) {
                  inspected++;
                  let payload = row.message;
                  let format = type(payload);
                  if (typeof payload === "string") {
                    try { payload = JSON.parse(payload); format = "json-" + type(payload); }
                    catch { format = payload.trim() ? "non-json-string" : "empty-string"; }
                  }
                  const text = typeof payload === "string" ? payload : payload && typeof payload === "object"
                    ? [payload.text, payload.content, payload.caption, payload.body].find((x) => typeof x === "string" && x.trim()) || "" : "";
                  const textGate = !text.trim() ? "no-recognized-text" :
                    text.trim().length >= 24 && !/\s/.test(text.trim()) && /^[A-Za-z0-9+/=]+$/.test(text.trim()) && text.trim().length % 4 === 0
                      ? "base64-like-heuristic-rejection-not-proof-of-encryption" : "text-field-present";
                  const entry = { msgType: typeof row.msgType === "number" && Number.isFinite(row.msgType) ? row.msgType : type(row.msgType),
                    format, textGate, recordShape: shape(row), payloadShape: shape(payload) };
                  const signature = JSON.stringify(entry);
                  if (!counts.has(signature)) counts.set(signature, { ...entry, count: 0 });
                  counts.get(signature).count++;
                }
              }
              cursor.continue();
            };
          });
        } finally { db.close(); }
      }, { databaseName: targetZdbName, groupId: "g1986619726266954037", t0: Date.now() });
      fs.mkdirSync(diagnosticsDir, { recursive: true });
      fs.writeFileSync(path.join(diagnosticsDir, "payload-structure.json"), JSON.stringify(summary, null, 2), "utf8");
      console.log(`Payload structure diagnostic: ${summary.inspected} records; metadata-only report saved.`);
      return;
    }

    const result = await page.evaluate(
      async ({ targetZdbName, expectedSidxName }) => {
        const typeOf = (value) => {
          if (value === null) return "null";
          if (value instanceof Blob) return `Blob(${value.type || "unknown"})`;
          if (value instanceof ArrayBuffer) return "ArrayBuffer";
          if (ArrayBuffer.isView(value)) return value.constructor?.name || "TypedArray";
          if (value instanceof Date) return "Date";
          if (Array.isArray(value)) {
            const types = [...new Set(value.slice(0, 8).map(typeOf))];
            return `Array<${types.join("|") || "empty"}>`;
          }
          if (typeof value === "object") return "Object";
          return typeof value;
        };

        const getPath = (record, keyPath) => {
          if (typeof keyPath === "string") return record?.[keyPath];
          if (Array.isArray(keyPath)) return keyPath.map((key) => record?.[key]);
          return undefined;
        };

        const fieldTypes = (record, prefix = "", depth = 0, output = {}) => {
          if (depth > 5 || record == null || typeof record !== "object") return output;
          if (Array.isArray(record)) {
            if (record.length) fieldTypes(record[0], `${prefix}[]`, depth + 1, output);
            else output[`${prefix}[]`] = "empty-array";
            return output;
          }
          for (const [key, value] of Object.entries(record).slice(0, 150)) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            output[fieldPath] = typeOf(value);
            if (value && typeof value === "object" && !(value instanceof Blob) && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value) && !(value instanceof Date)) {
              fieldTypes(value, fieldPath, depth + 1, output);
            }
          }
          return output;
        };

        const idFields = new Set();
        const idPattern = /^(?:msgid|cliMsgId|clientMsgId|messageId|msg_id|cli_msg_id|message_id)$/i;
        const timePattern = /time|date|timestamp|dttm/i;
        const addKeyPath = (keyPath) => {
          const fields = Array.isArray(keyPath) ? keyPath : [keyPath];
          for (const field of fields) {
            if (typeof field === "string" && idPattern.test(field) && !timePattern.test(field)) {
              idFields.add(field);
            }
          }
        };

        const getIdValues = (record, prefix = "", depth = 0, output = []) => {
          if (depth > 5 || record == null || typeof record !== "object") return output;
          if (Array.isArray(record)) {
            record.slice(0, 12).forEach((item, index) => getIdValues(item, `${prefix}[${index}]`, depth + 1, output));
            return output;
          }
          for (const [key, value] of Object.entries(record).slice(0, 150)) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            if (idPattern.test(key) && !timePattern.test(key) && (typeof value === "string" || typeof value === "number")) {
              idFields.add(key);
              output.push({ fieldPath, value: String(value) });
            }
            if (value && typeof value === "object" && !(value instanceof Blob) && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value) && !(value instanceof Date)) {
              getIdValues(value, fieldPath, depth + 1, output);
            }
          }
          return output;
        };

        const databases = await indexedDB.databases();
        const availableNames = databases.map((item) => String(item.name || ""));
        const sidxName = availableNames.includes(expectedSidxName)
          ? expectedSidxName
          : availableNames.find((name) => name.startsWith("sidx_") && name.endsWith("398134954462017570")) || null;

        const openExisting = (name) => new Promise((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onupgradeneeded = () => {
            try { request.transaction?.abort(); } catch {}
            reject(new Error(`Database ${name} không còn tồn tại; đã chặn tạo mới.`));
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error(`Không mở được ${name}`));
          request.onblocked = () => reject(new Error(`Database ${name} đang bị khóa bởi một transaction khác.`));
        });

        const inspectDatabase = async (name, storeName) => {
          if (!name) return { databaseName: null, storeName, exists: false, reason: "database-not-found", stores: [], samples: [] };
          const db = await openExisting(name);
          try {
            if (!db.objectStoreNames.contains(storeName)) {
              return { databaseName: name, storeName, exists: false, reason: "store-not-found", stores: Array.from(db.objectStoreNames), samples: [] };
            }

            const metadata = await new Promise((resolve, reject) => {
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);
              const indexes = Array.from(store.indexNames).map((indexName) => {
                const index = store.index(indexName);
                addKeyPath(index.keyPath);
                return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
              });
              addKeyPath(store.keyPath);
              resolve({ keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes });
              tx.onabort = () => reject(tx.error || new Error(`Readonly transaction aborted: ${name}/${storeName}`));
            });

            const samples = await new Promise((resolve, reject) => {
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);
              const request = store.openCursor(null, "next");
              const rows = [];
              request.onerror = () => reject(request.error || new Error(`Cursor failed: ${name}/${storeName}`));
              request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor || rows.length >= 3) {
                  resolve(rows);
                  return;
                }
                rows.push({ key: cursor.key, primaryKey: cursor.primaryKey, value: cursor.value });
                cursor.continue();
              };
              tx.onabort = () => reject(tx.error || new Error(`Readonly sample transaction aborted: ${name}/${storeName}`));
            });

            return {
              databaseName: name,
              storeName,
              exists: true,
              ...metadata,
              fieldTypes: Object.assign({}, ...samples.map((row) => fieldTypes(row.value))),
              samples,
            };
          } finally {
            db.close();
          }
        };

        const zdb = await inspectDatabase(targetZdbName, "message");
        const sidx = await inspectDatabase(sidxName, "idx_queue");

        const sanitizeState = {
          identifiers: new Map(),
          users: new Map(),
          groups: new Map(),
          media: new Map(),
          next: { id: 1, user: 1, group: 1, media: 1 },
        };
        const placeholder = (mapName, prefix, raw) => {
          const map = sanitizeState[mapName];
          const key = String(raw);
          if (!map.has(key)) map.set(key, `${prefix}_${sanitizeState.next[mapName]++}`);
          return map.get(key);
        };
        const sanitize = (value, key = "", depth = 0) => {
          if (depth > 7) return "[MAX_DEPTH]";
          if (value == null) return value;
          if (value instanceof Blob) return { type: "Blob", mimeType: value.type || "", size: value.size };
          if (value instanceof ArrayBuffer) return { type: "ArrayBuffer", byteLength: value.byteLength };
          if (ArrayBuffer.isView(value)) return { type: value.constructor?.name || "TypedArray", byteLength: value.byteLength };
          if (value instanceof Date) return "[REDACTED_DATE]";
          if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitize(item, key, depth + 1));
          if (typeof value === "object") {
            const output = {};
            for (const [childKey, childValue] of Object.entries(value).slice(0, 150)) {
              output[childKey] = sanitize(childValue, childKey, depth + 1);
            }
            return output;
          }
          const lowerKey = String(key).toLowerCase();
          if (/(token|secret|password|cookie|authorization|phone|mobile|username|displayname|dname|sendername|account)/i.test(key)) return "[REDACTED]";
          if (/(url|uri|href|src|poster|thumbnail)/i.test(key) || (typeof value === "string" && /^https?:\/\//i.test(value))) {
            return placeholder("media", "MEDIA", value);
          }
          if (/(toUid|groupId|chatId|conversationId)/i.test(key)) return placeholder("groups", "GROUP", value);
          if (/(fromUid|userId|ownerId|senderId)/i.test(key)) return placeholder("users", "USER", value);
          if (idPattern.test(key) || lowerKey === "id") return placeholder("identifiers", "ID", value);
          if (/(senddttm|servertime|timestamp|createdat|updatedat|date)/i.test(key)) return "[REDACTED_TIMESTAMP]";
          if (key === "message" || key === "text" || key === "content" || key === "caption" || key === "description") {
            if (typeof value === "string") return "[REDACTED_TEXT]";
          }
          if (typeof value === "string") {
            if (/^chat\.[a-z0-9_.-]+$/i.test(value)) return value;
            return "[REDACTED_STRING]";
          }
          if (typeof value === "number" && /(msgtype|imageindex|totalimages|width|height|duration|size|version|count)/i.test(key)) return value;
          return typeof value === "number" ? "[REDACTED_NUMBER]" : value;
        };

        const sanitizeSamples = (source) => source.samples.map((row, index) => ({
          sample: index + 1,
          key: sanitize(row.key, "$key"),
          primaryKey: sanitize(row.primaryKey, "$primaryKey"),
          value: sanitize(row.value),
        }));

        const collectCandidateValues = (source) => source.samples.map((row, sampleIndex) => {
          const values = getIdValues(row.value).filter((entry) => entry.value.length > 0);
          return { sampleIndex: sampleIndex + 1, values };
        });
        const zdbIds = collectCandidateValues(zdb);
        const sidxIds = collectCandidateValues(sidx);
        const matches = [];
        for (const left of zdbIds) {
          for (const leftValue of left.values) {
            for (const right of sidxIds) {
              for (const rightValue of right.values) {
                if (leftValue.value === rightValue.value) {
                  matches.push({
                    zdbSample: left.sampleIndex,
                    zdbField: leftValue.fieldPath,
                    sidxSample: right.sampleIndex,
                    sidxField: rightValue.fieldPath,
                    identifierPlaceholder: placeholder("identifiers", "ID", leftValue.value),
                  });
                }
              }
            }
          }
        }

        return {
          capturedAt: new Date().toISOString(),
          profileOrigin: location.origin,
          databases: availableNames.filter((name) => name === targetZdbName || name.startsWith("sidx_")),
          zdb: {
            databaseName: zdb.databaseName,
            storeName: zdb.storeName,
            exists: zdb.exists,
            reason: zdb.reason,
            keyPath: zdb.keyPath,
            autoIncrement: zdb.autoIncrement,
            indexes: zdb.indexes,
            fieldTypes: zdb.fieldTypes,
            samples: sanitizeSamples(zdb),
          },
          sidx: {
            databaseName: sidx.databaseName,
            storeName: sidx.storeName,
            exists: sidx.exists,
            reason: sidx.reason,
            keyPath: sidx.keyPath,
            autoIncrement: sidx.autoIncrement,
            indexes: sidx.indexes,
            fieldTypes: sidx.fieldTypes,
            samples: sanitizeSamples(sidx),
          },
          identityFieldCandidates: Array.from(idFields),
          exactIdentifierMatches: matches,
          limits: { recordsPerStore: 3, usesMessageTimestampsForMatching: false },
        };
      },
      { targetZdbName, expectedSidxName },
    );

    if (!result.zdb.exists || !result.sidx.exists) {
      throw new Error(
        `IndexedDB store chưa đủ để chẩn đoán: zdb/message=${result.zdb.exists}, sidx/idx_queue=${result.sidx.exists}; các database đang có: ${result.databases.join(", ") || "none"}`,
      );
    }

    fs.mkdirSync(diagnosticsDir, { recursive: true });
    fs.writeFileSync(
      path.join(diagnosticsDir, "indexeddb-schema.json"),
      JSON.stringify({ capturedAt: result.capturedAt, profileOrigin: result.profileOrigin, zdb: { databaseName: result.zdb.databaseName, storeName: result.zdb.storeName, exists: result.zdb.exists, keyPath: result.zdb.keyPath, autoIncrement: result.zdb.autoIncrement, indexes: result.zdb.indexes, fieldTypes: result.zdb.fieldTypes }, sidx: { databaseName: result.sidx.databaseName, storeName: result.sidx.storeName, exists: result.sidx.exists, keyPath: result.sidx.keyPath, autoIncrement: result.sidx.autoIncrement, indexes: result.sidx.indexes, fieldTypes: result.sidx.fieldTypes }, identityFieldCandidates: result.identityFieldCandidates }, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(diagnosticsDir, "indexeddb-samples.json"),
      JSON.stringify({ capturedAt: result.capturedAt, zdb: result.zdb.samples, sidx: result.sidx.samples, exactIdentifierMatches: result.exactIdentifierMatches, limits: result.limits }, null, 2),
      "utf8",
    );
    console.log(`Đã lưu schema và tối đa 3 mẫu/store tại ${diagnosticsDir}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

main().catch((error) => fail(error?.message || String(error)));
