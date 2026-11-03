import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHomeSearchKeyword as normalize, stripAnonHouseNumber, roomMatchesSearch, normalizeSearchKeyword } from "./search";

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


test("anon strips address house prefixes, preserves named streets, and searches room codes", async () => {
  for (const query of ["257/17 Phan Xích Long", "12/3, Phan Xích Long", "Số nhà 257 Phan Xích Long"]) assert.equal(normalize(query, false), "phan xích long");
  assert.equal(stripAnonHouseNumber("3 tháng 2"), "3 tháng 2");
  assert.equal(normalize("Phường 3", false), "phường 3");
  assert.equal(normalize("Quận 10", false), "quận 10");
  const room = { house_number: "257/17", address: "Phan Xích Long", ward: "3", district: "Phú Nhuận", room_code: "G1" };
  assert.equal(roomMatchesSearch(room, "G1", false), true);
  assert.equal(roomMatchesSearch(room, "mã phòng G1", false), true);
  assert.equal(roomMatchesSearch(room, "257/17", false), false);
  assert.equal(roomMatchesSearch(room, "257/17 Phan Xích Long", false), true);
  assert.equal(roomMatchesSearch(room, "Phường 3", false), true);
  assert.equal(normalize("257/17 Phan Xích Long", true), "257/17 phan xích long");
});
