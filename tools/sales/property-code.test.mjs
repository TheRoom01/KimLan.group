import assert from "node:assert/strict";
import { test } from "node:test";
import { generatePropertyCode } from "../../lib/owner/propertyCode.ts";
import { findSalesBuilding } from "../../lib/sales-portal/collection.ts";

test("Vietnamese addresses preserve alleys and separate street words", () => {
  assert.equal(generatePropertyCode({ houseNumber: "177/10/11", address: "Trương Định", district: "Quận 3" }), "177/10/11-TRUONG.DINH-Q3");
  assert.equal(generatePropertyCode({ houseNumber: "152/38", address: "Nguyễn Trọng Tuyển", district: "Phú Nhuận" }), "152/38-NGUYEN.TRONG.TUYEN-PHU.NHUAN");
  assert.equal(generatePropertyCode({ houseNumber: "107/11-11A", address: "Đường Số 1", district: "7" }), "107/11-11A-SO.1-Q7");
});
test("old codes resolve only inside the authorized collection", () => {
  const buildings = [{ id: "a", code: "177/10/11-TRUONG.DINH-Q3", code_aliases: ["177-10-11.TRUONG-DINH.Q3", "KL-ABC"] }];
  assert.equal(findSalesBuilding(buildings, "177-10-11.TRUONG-DINH.Q3")?.id, "a");
  assert.equal(findSalesBuilding(buildings, "KL-ABC--a")?.id, "a");
  assert.equal(findSalesBuilding([], "KL-ABC"), undefined);
  assert.equal(findSalesBuilding([...buildings, {id:"b",code:"B",code_aliases:["KL-ABC"]}], "KL-ABC"), undefined);
});
