import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretRoomSearch } from "./interpretRoomSearch";
import { readHomeListFilters, readHomeListPage, roomListFilterRpcParams } from "./listFilters";

const query = "Tìm căn 2PN gần UEH dưới 8 triệu";
const env = {
  FREE_LLM_API_ENABLED: "true",
  GROQ_API_KEY: "test-groq-key",
};
const valid = { location: "UEH", roomType: "2 Phòng ngủ", minPrice: null, maxPrice: 8_000_000, currency: "VND" };
const completion = (content: string) => Response.json({ choices: [{ message: { content } }] });
const unexpected: typeof fetch = async () => assert.fail("Unexpected upstream call");

test("Vietnamese query uses the OpenAI request and existing Home filter and cursor contracts", async () => {
  const result = await interpretRoomSearch(query, {
    env,
    request: async (url, options) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-groq-key");
      const payload = JSON.parse(String(options?.body));
      assert.equal(payload.model, "qwen/qwen3.8-27b");
      assert.deepEqual(payload.messages.slice(1), [{ role: "user", content: query }]);
      return completion(JSON.stringify(valid));
    },
  });
  assert.deepEqual(result, { location: "UEH", roomType: "2 Phòng ngủ", minPrice: null, maxPrice: 8_000_000 });
  assert.ok(result);
  const params = new URLSearchParams({ q: result.location, t: result.roomType!, max: String(result.maxPrice), d: "Quận 10" });
  const filters = readHomeListFilters(key => params.get(key));
  assert.deepEqual(filters.priceApplied, [3_000_000, 8_000_000]);
  assert.deepEqual(filters.selectedRoomTypes, ["2 Phòng ngủ"]);
  assert.deepEqual(filters.selectedDistricts, ["Quận 10"]);
  const rpc = roomListFilterRpcParams({
    search: filters.search, maxPrice: filters.priceApplied[1], roomTypes: filters.selectedRoomTypes,
  });
  assert.ok(Object.values(rpc).includes(8_000_000));
  assert.deepEqual(readHomeListPage(key => params.get(key)), { nextPage: 0, c: null });
  params.set("p", "1");
  params.set("c", Buffer.from(JSON.stringify("next-room")).toString("base64url"));
  assert.deepEqual(readHomeListPage(key => params.get(key)), { nextPage: 1, c: "next-room" });
});

test("invalid content, all-provider 429, timeout and network failure fall back", async () => {
  for (const content of [
    "{",
    JSON.stringify({ ...valid, location: "UEH Cơ sở B" }),
    JSON.stringify({ ...valid, roomType: "Penthouse" }),
    JSON.stringify({ ...valid, currency: "USD" }),
  ]) {
    assert.equal(await interpretRoomSearch(query, { env, request: async () => completion(content) }), null);
  }
  assert.equal(await interpretRoomSearch(query, { env, request: async () => new Response(null, { status: 429 }) }), null);
  assert.equal(await interpretRoomSearch(query, {
    env, timeoutMs: 5,
    request: async (_url, options) => new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("Abort signal failed")), 100);
      options?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(options.signal?.reason);
      }, { once: true });
    }),
  }), null);
  assert.equal(await interpretRoomSearch(query, { env, request: async () => { throw new Error("network"); } }), null);
});

test("disabled, incomplete config, keyword and oversized inputs skip upstream", async () => {
  for (const config of [{}, { ...env, FREE_LLM_API_ENABLED: "false" }, { ...env, GROQ_API_KEY: "" }]) {
    assert.equal(await interpretRoomSearch(query, { env: config, request: unexpected }), null);
  }
  assert.equal(await interpretRoomSearch("UEH", { env, request: unexpected }), null);
  assert.equal(await interpretRoomSearch(query.repeat(20), { env, request: unexpected }), null);
});

test("429 and invalid data advance the chain sequentially and skip Cerebras", async () => {
  const seen: string[] = [];
  const result = await interpretRoomSearch(query, {
    env: { ...env, VERCEL_ENV: "preview", GEMINI_API_KEY: "test-gemini-key", OPENROUTER_API_KEY: "test-openrouter-key", CEREBRAS_API_KEY: "ignored" },
    request: async (url, options) => {
      const host = new URL(String(url)).hostname;
      const model = JSON.parse(String(options?.body)).model;
      seen.push(host);
      if (host === "api.groq.com") return new Response(null, { status: 429 });
      if (host === "generativelanguage.googleapis.com") {
        assert.equal(model, "gemini-3.1-flash-lite");
        assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-gemini-key");
        return completion(JSON.stringify({ ...valid, currency: "USD" }));
      }
      assert.equal(model, "nvidia/nemotron-3.5-lightning:free");
      assert.deepEqual(JSON.parse(String(options?.body)).provider.max_price, { prompt: 0, completion: 0 });
      return completion(JSON.stringify(valid));
    },
  });
  assert.deepEqual(seen, ["api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai"]);
  assert.equal(result?.maxPrice, 8_000_000);
});

test("production skips Gemini and simultaneous identical submissions share one chain", async () => {
  const seen: string[] = [];
  const options = {
    env: { ...env, VERCEL_ENV: "production", GEMINI_API_KEY: "ignored", OPENROUTER_API_KEY: "test-openrouter-key" },
    request: async (url: Parameters<typeof fetch>[0]) => {
      seen.push(new URL(String(url)).hostname);
      return new Response(null, { status: 429 });
    },
  };
  assert.deepEqual(await Promise.all([interpretRoomSearch(query, options), interpretRoomSearch(query, options)]), [null, null]);
  assert.deepEqual(seen, ["api.groq.com", "openrouter.ai"]);
});

test("quota is capped within each running server instance", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 429 });
  };
  for (let index = 0; index < 15; index += 1) {
    assert.equal(await interpretRoomSearch(query, { env, request }), null);
  }
  assert.equal(calls, 2);
});
