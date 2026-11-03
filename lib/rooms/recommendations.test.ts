import assert from "node:assert/strict";
import { test } from "node:test";
import { hasRecommendationFilters, parseRecommendationRequest, recommendationLabels, recommendationPrices, recommendationRpcParams, type RecommendationFilters } from "./recommendations";

export const defaultRecommendationFilters: RecommendationFilters = {
  search: "", priceFilterActive: false, minPrice: 3_000_000, maxPrice: 30_000_000,
  districts: [], roomTypes: [], move: null, petPolicies: [], contractTerms: [], features: [], status: null, badge: null, sortMode: "updated_desc",
};
test("only MAX is extended: 5–7 → 5–9, 8–12 → 8–14, 10–15 → 10–17", () => {
  for (const [min,max,expected] of [[5,7,9],[8,12,14],[10,15,17]]) {
    const filters = { ...defaultRecommendationFilters, priceFilterActive: true, minPrice: min*1e6, maxPrice: max*1e6 };
    assert.deepEqual(recommendationPrices(filters), { minPrice: min*1e6, maxPrice: expected*1e6 });
    assert.equal(recommendationLabels(filters).labels[0], `Khoảng giá: ${(min*1e6).toLocaleString("vi-VN")} – ${(expected*1e6).toLocaleString("vi-VN")}đ`);
    assert.equal(recommendationRpcParams(filters,[]).p_min_price,min*1e6);
    assert.equal(recommendationRpcParams(filters,[]).p_max_price,expected*1e6);
    assert.equal(filters.maxPrice,max*1e6,"main filter input is never mutated");
  }
});
test("default slider is not a chosen price; filters absent means no section", () => {
  assert.equal(hasRecommendationFilters(defaultRecommendationFilters),false);
  assert.deepEqual(recommendationPrices(defaultRecommendationFilters),{minPrice:null,maxPrice:null});
  assert.deepEqual(recommendationLabels(defaultRecommendationFilters).labels,[]);
  assert.equal(hasRecommendationFilters({...defaultRecommendationFilters,search:"ab"}),false);
});
test("single bounds retain MIN and only extend an explicit MAX", () => {
  assert.deepEqual(recommendationPrices({...defaultRecommendationFilters,priceFilterActive:true,minPrice:5e6,maxPrice:null}),{minPrice:5e6,maxPrice:null});
  assert.deepEqual(recommendationPrices({...defaultRecommendationFilters,priceFilterActive:true,minPrice:null,maxPrice:7e6}),{minPrice:null,maxPrice:9e6});
});
test("district/amenities-only filters impose no slider price or fabricated radius", () => {
  const filters = {...defaultRecommendationFilters,districts:["Quận 1"],features:["window"] as const};
  const params=recommendationRpcParams({...filters,features:[...filters.features]},[]);
  assert.deepEqual(params.p_districts,["Quận 1","1"]);
  assert.equal(params.p_min_price,null);assert.equal(params.p_max_price,null);assert.equal(params.p_center_lat,null);
  assert.equal(recommendationLabels({...filters,features:[...filters.features]}).labels.some(l=>l.includes("km")),false);
});
test("all filters and room status survive recommendation mapping; no main sort passed", () => {
  const f: RecommendationFilters={...defaultRecommendationFilters,search:"257/17 Phan Xích Long",districts:["Quận 3"],roomTypes:["1 Phòng ngủ"],move:"elevator",petPolicies:["cat"],contractTerms:["short"],features:["balcony","window"],status:"Đã thuê",badge:"featured",sortMode:"price_asc"};
  const p=recommendationRpcParams(f,[]);
  assert.equal(p.p_search,"phan xích long");assert.deepEqual(p.p_room_types,["1 Phòng ngủ","1PN"]);
  assert.deepEqual(p.p_statuses,["Đã thuê"]);assert.deepEqual(p.p_features,f.features);assert.equal(p.p_move,f.move);
  assert.deepEqual(p.p_pet_policies,f.petPolicies);assert.deepEqual(p.p_contract_terms,f.contractTerms);assert.equal(p.p_badge,f.badge);
  assert.equal("p_sort" in p,false);
});
test("GPS + district fallback labels do not claim missing GPS is verified within 3km", () => {
  const labels=recommendationLabels({...defaultRecommendationFilters,districts:["Quận 1"],center:{latitude:10.7626,longitude:106.6819}}).labels;
  assert(labels.includes("Có GPS: trong 3 km · đường chim bay"));
  assert(labels.includes("Thiếu GPS: theo quận đã chọn"));
});
test("API rejects invalid prices, coordinates, IDs and unsupported filters", () => {
  for (const change of [{minPrice:-1},{minPrice:NaN},{priceFilterActive:true,minPrice:8e6,maxPrice:5e6},{center:{latitude:91,longitude:106}},{features:["invented"]},{status:"available"}]) {
    assert.throws(()=>parseRecommendationRequest({filters:{...defaultRecommendationFilters,...change}}));
  }
  assert.throws(()=>parseRecommendationRequest({filters:defaultRecommendationFilters,excludeIds:["invalid"]}));
  const parsed=parseRecommendationRequest({filters:{...defaultRecommendationFilters,districts:["Quận 1"]}});
  assert.equal(recommendationRpcParams(parsed.filters,[]).p_max_price,null);
});
