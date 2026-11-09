import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

process.env.ANON_HOME_SESSION_SECRET = "test-only-anonymous-home-session-secret-with-32-bytes";

const source = await readFile(new URL("../lib/anonymousHomeSessionToken.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "cjs", target: "es2022" });
const compiledModule = { exports: {} };
new Function("module", "exports", compiled.code)(compiledModule, compiledModule.exports);
const { createAnonymousHomeSessionToken, verifyAnonymousHomeSessionToken } = compiledModule.exports;

const token = await createAnonymousHomeSessionToken(Date.now());
const verified = await verifyAnonymousHomeSessionToken(token);
assert.ok(verified?.id, "server-signed token is accepted");
assert.equal(await verifyAnonymousHomeSessionToken(`${token.slice(0, -1)}x`), null, "tampered token is rejected");

const [id, startedAt, signature] = token.split(".");
assert.equal(await verifyAnonymousHomeSessionToken(`${crypto.randomUUID()}.${startedAt}.${signature}`), null, "client cannot replace session id");
assert.equal(await verifyAnonymousHomeSessionToken(`${id}.${Number(startedAt) + 1}.${signature}`), null, "client cannot replace start time");
assert.equal(await verifyAnonymousHomeSessionToken("not-a-token"), null);

console.log("Anonymous Home signed session token: PASS");
