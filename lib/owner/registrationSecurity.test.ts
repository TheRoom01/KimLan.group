import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { verifyTurnstileToken } from "./registrationSecurity";
import { POST as submitRoomConsultRequest } from "../../app/api/room-consult-requests/route";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});

test("accepts a successful Siteverify result only when hostname and action match", async () => {
  let sentBody = "";
  globalThis.fetch = (async (_input, init) => {
    sentBody = String(init?.body ?? "");
    return Response.json({ success: true, hostname: "example.test", action: "room_consult_request" });
  }) as typeof fetch;

  assert.equal(
    await verifyTurnstileToken("valid-token", "203.0.113.5", "example.test", "room_consult_request"),
    true,
  );
  assert.equal(new URLSearchParams(sentBody).get("response"), "valid-token");
  assert.equal(new URLSearchParams(sentBody).get("secret"), "test-turnstile-secret");
});

test("rejects a valid token with the wrong hostname or action", async () => {
  globalThis.fetch = (async () => Response.json({
    success: true,
    hostname: "example.test",
    action: "room_consult_request",
  })) as typeof fetch;

  assert.equal(await verifyTurnstileToken("token", "", "other.test", "room_consult_request"), false);
  assert.equal(await verifyTurnstileToken("token", "", "example.test", "owner_login"), false);
});

test("rejects invalid tokens and Siteverify network failures", async () => {
  globalThis.fetch = (async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] })) as typeof fetch;
  assert.equal(await verifyTurnstileToken("invalid-token", "", "example.test", "room_consult_request"), false);

  globalThis.fetch = (async () => { throw new Error("network unavailable"); }) as typeof fetch;
  assert.equal(await verifyTurnstileToken("token", "", "example.test", "room_consult_request"), false);
});

test("the public request endpoint rejects missing and invalid tokens before storage", async () => {
  const requestBody = {
    request_key: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b",
    room_id: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a",
    guest_name: "Nguyễn An",
    guest_phone: "0912345678",
    request_type: "consultation",
  };
  let siteverifyCalls = 0;
  globalThis.fetch = (async () => {
    siteverifyCalls += 1;
    return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
  }) as typeof fetch;

  const submit = (body: Record<string, unknown>) => submitRoomConsultRequest(new Request(
    "https://example.test/api/room-consult-requests",
    { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify(body) },
  ));

  const missingToken = await submit(requestBody);
  assert.equal(missingToken.status, 400);
  assert.equal(siteverifyCalls, 0);

  const invalidToken = await submit({ ...requestBody, captcha_token: "invalid-token" });
  assert.equal(invalidToken.status, 400);
  assert.equal(siteverifyCalls, 1);
});
