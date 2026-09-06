import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCollectionTokens, collectionPath, salesBuildingKey, findSalesBuilding } from "../../lib/sales-portal/collection.ts";

const first = "a".repeat(43);
const second = "b".repeat(43);

test("slashes become dots only in URLs while old URLs still resolve", () => {
  const property = { id: "id-1", code: "45/10-PHAM.VIET.CHANH-Q1" };
  const properties = [property];
  const key = salesBuildingKey(property, properties);
  assert.equal(key, "45.10-PHAM.VIET.CHANH-Q1");
  assert.equal(findSalesBuilding(properties, key)?.id, property.id);
  assert.equal(findSalesBuilding(properties, property.code)?.id, property.id);
  assert.equal(property.code, "45/10-PHAM.VIET.CHANH-Q1");
  assert.equal(encodeURIComponent(key).includes("%2F"), false);
});

test("normalized URL collisions do not select the wrong building", () => {
  const properties = [{ id: "a", code: "45/10-STREET-Q1" }, { id: "b", code: "45.10-STREET-Q1" }];
  for (const property of properties) {
    assert.equal(findSalesBuilding(properties, salesBuildingKey(property, properties))?.id, property.id);
  }
  assert.equal(findSalesBuilding(properties, "45/10-STREET-Q1")?.id, "a");
});

test("building codes resolve only within shared buildings, including old UUID links", () => {
  const properties = [{ id: "id-1", code: "139NVC" }, { id: "id-2", code: "55/26 TĐX" }];
  assert.equal(salesBuildingKey(properties[0], properties), "139NVC");
  assert.equal(findSalesBuilding(properties, "139NVC")?.id, "id-1");
  assert.equal(findSalesBuilding(properties, "id-1")?.id, "id-1");
  assert.equal(findSalesBuilding(properties, "unshared"), undefined);
  const url = new URL(`https://example.com/sales?building=${encodeURIComponent(salesBuildingKey(properties[1], properties))}`);
  assert.equal(findSalesBuilding(properties, url.searchParams.get("building"))?.id, "id-2");
});

test("duplicate and missing building codes remain unambiguous", () => {
  const properties = [{ id: "id-1", code: "DUP" }, { id: "id-2", code: "DUP" }, { id: "id-3", code: null }];
  for (const property of properties) {
    assert.equal(findSalesBuilding(properties, salesBuildingKey(property, properties))?.id, property.id);
  }
  assert.equal(findSalesBuilding(properties, "DUP"), undefined);
});

test("collection URL preserves distinct access tokens", () => {
  const url = new URL(collectionPath([first, second]), "https://example.com");
  assert.deepEqual(parseCollectionTokens(url.searchParams.get("links")), [first, second]);
  assert.deepEqual(parseCollectionTokens(`${first},${first}`), [first]);
});

test("rejects malformed or ambiguous token lists", () => {
  for (const value of [undefined, "", "invalid", [first, second], `${first},`, `${first},<script>`]) {
    assert.deepEqual(parseCollectionTokens(value), []);
  }
});

test("bounds the number of public lookups", () => {
  const tokens = Array.from({ length: 31 }, (_, i) => String(i).padStart(43, "a"));
  assert.equal(parseCollectionTokens(tokens.slice(0, 30).join(",")).length, 30);
  assert.deepEqual(parseCollectionTokens(tokens.join(",")), []);
});
