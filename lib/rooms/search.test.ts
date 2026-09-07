import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchKeyword } from "./search";

test("preserves house numbers and matches admin ward normalization", () => {
  assert.equal(normalizeSearchKeyword(" 257/17 Phan Xích "), "257/17 phan xích");
  for (const ward of ["P.Đức Nhuận", "P. Đức Nhuận", "Phường Đức Nhuận"]) {
    assert.equal(normalizeSearchKeyword(ward), "đức nhuận");
  }
  assert.equal(normalizeSearchKeyword("463B/63, Phường13"), "463b/63 13");
  assert.equal(normalizeSearchKeyword("Phan Xích".normalize("NFD")), "phan xích");
});

test("ignores short or empty queries", () => {
  for (const query of [null, undefined, "", "  ", "ab", "P.13"]) {
    assert.equal(normalizeSearchKeyword(query), "");
  }
});
