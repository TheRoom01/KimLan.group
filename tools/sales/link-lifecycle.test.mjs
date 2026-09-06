import assert from "node:assert/strict";
import { test } from "node:test";
import { isSalesLinkVisible, revokedLinkCutoff, REVOKED_LINK_RETENTION_MS } from "../../lib/sales-portal/linkLifecycle.ts";

const now = Date.parse("2026-09-06T12:00:00Z");
test("active links remain visible", () => {
  assert.equal(isSalesLinkVisible({ revoked_at: null }, now), true);
});
test("revoked links disappear exactly 72 hours after revocation", () => {
  assert.equal(isSalesLinkVisible({ revoked_at: new Date(now - REVOKED_LINK_RETENTION_MS + 1).toISOString() }, now), true);
  assert.equal(isSalesLinkVisible({ revoked_at: revokedLinkCutoff(now) }, now), false);
  assert.equal(isSalesLinkVisible({ revoked_at: "2026-09-01T12:00:00Z" }, now), false);
});
test("cutoff uses elapsed time across timezone offsets", () => {
  assert.equal(revokedLinkCutoff(now), "2026-09-03T12:00:00.000Z");
  assert.equal(isSalesLinkVisible({ revoked_at: "2026-09-03T19:00:00+07:00" }, now), false);
  assert.equal(isSalesLinkVisible({ revoked_at: "invalid" }, now), false);
});
