import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

type PropertyRow = {
  id: string;
  house_number: string | null;
  address: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
};

type CacheEntry = {
  version: number;
  provider: string;
  query: string;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  countryCode: string | null;
  status: "matched" | "not_found" | "rejected" | "error";
  checkedAt: string;
  precision?: "exact" | "alley_entrance";
  geocodedQuery?: string;
};

const CACHE_VERSION = 3;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const quiet = args.has("--quiet");
const resumeOnly = args.has("--resume-only");
const cacheMissesOnly = args.has("--cache-misses-only");
const preferSingleExclusion = args.has("--prefer-single-exclusion");
const recoverOldBatches = args.has("--recover-old-batches");
const recoverNewBatches = args.has("--recover-new-batches");
const recoverAlleyBatches = args.has("--recover-alley-batches");
const fallbackAlleyEntrances = args.has("--fallback-alley-entrances");
const acceptAlleyEntrances = args.has("--accept-alley-entrances");
const applyCachedAlleyEntrances = args.has("--apply-cached-alley-entrances");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const maxNewArg = process.argv.find((value) => value.startsWith("--max-new="));
const requestedLimit = Math.max(1, Number(limitArg?.split("=")[1] ?? 10));
const maxNew = maxNewArg ? Math.max(0, Number(maxNewArg.split("=")[1])) : Number.POSITIVE_INFINITY;
const geoapifyKey = process.env.GEOAPIFY_API_KEY;
const providerUrl = geoapifyKey
  ? "https://api.geoapify.com"
  : process.env.MAP_GEOCODING_BASE_URL ?? "https://nominatim.openstreetmap.org";
const providerName = geoapifyKey ? "geoapify" : new URL(providerUrl).hostname;
const isPublicNominatim = new URL(providerUrl).hostname === "nominatim.openstreetmap.org";
const limit = isPublicNominatim ? Math.min(requestedLimit, 100) : requestedLimit;
const defaultDelayMs = geoapifyKey ? 250 : 100;
const delayMs = isPublicNominatim
  ? 1100
  : Math.max(0, Number(process.env.MAP_GEOCODING_DELAY_MS ?? defaultDelayMs));
const cachePath = path.join(process.cwd(), ".map-geocode-cache.json");
const batchJobsPath = path.join(process.cwd(), ".map-geocode-batch-jobs.json");

if (isPublicNominatim && requestedLimit > 100) {
  throw new Error("Public Nominatim is restricted to a one-time trial batch of at most 100. Configure MAP_GEOCODING_BASE_URL for larger backfills.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRole) throw new Error("Missing Supabase environment variables");
const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

async function loadCache(): Promise<Record<string, CacheEntry>> {
  try { return JSON.parse(await readFile(cachePath, "utf8")) as Record<string, CacheEntry>; }
  catch { return {}; }
}

type BatchJobState = Record<string, { id: string; submittedAt: string; size: number }>;

async function loadBatchJobs(): Promise<BatchJobState> {
  try { return JSON.parse(await readFile(batchJobsPath, "utf8")) as BatchJobState; }
  catch { return {}; }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fullAddress = (property: PropertyRow) => [property.house_number, property.address, property.ward, property.district, property.city, "Việt Nam"].filter(Boolean).join(", ");

function alleyEntranceProperty(property: PropertyRow): PropertyRow | null {
  const houseNumber = property.house_number?.trim() ?? "";
  if (!houseNumber.includes("/")) return null;
  const entranceNumber = houseNumber.match(/^\D*(\d+)/)?.[1];
  if (!entranceNumber || normalize(entranceNumber) === normalize(houseNumber)) return null;
  return { ...property, house_number: entranceNumber };
}

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9/]+/g, " ").trim();

function isReliableMatch(property: PropertyRow, row: { display_name?: string; address?: { country_code?: string; house_number?: string; road?: string } }) {
  const expectedStreet = normalize(property.address);
  const expectedHouse = normalize(property.house_number).replace(/\s/g, "");
  const label = normalize(row.display_name);
  const resultStreet = normalize(row.address?.road);
  const resultHouse = normalize(row.address?.house_number).replace(/\s/g, "");
  const streetTokens = expectedStreet.split(" ").filter((token) => token.length >= 2 && !["duong", "hem", "phuong"].includes(token));
  const streetMatches = streetTokens.length > 0 && streetTokens.every((token) => resultStreet.includes(token) || label.includes(token));
  // Do not widen a house number (for example, 46 -> 46/11). In dense urban
  // areas that may be a different building even when the street matches.
  const houseMatches = Boolean(expectedHouse && resultHouse)
    && resultHouse === expectedHouse;
  const wardTokens = normalize(property.ward).split(" ").filter((token) => token.length >= 2 && token !== "phuong");
  const genericStreetMatchesWard = !/^duong so \d+/.test(expectedStreet)
    || (wardTokens.length > 0 && wardTokens.every((token) => label.includes(token)));
  return streetMatches && houseMatches && genericStreetMatchesWard;
}

function cachedResultStillReliable(property: PropertyRow, result: CacheEntry) {
  const expectedStreet = normalize(property.address);
  if (!/^duong so \d+/.test(expectedStreet)) return true;
  const label = normalize(result.label);
  const wardTokens = normalize(property.ward).split(" ").filter((token) => token.length >= 2 && token !== "phuong");
  return wardTokens.length > 0 && wardTokens.every((token) => label.includes(token));
}

// The current inventory is in Ho Chi Minh City. This deliberately includes
// the full municipality while excluding same-named streets in other provinces.
function isWithinMapArea(latitude: number, longitude: number) {
  return latitude >= 10.3 && latitude <= 11.2
    && longitude >= 106.3 && longitude <= 107.1;
}

type NormalizedResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: { country_code?: string; house_number?: string; road?: string };
};

const emptyResult = (query: string, status: CacheEntry["status"]): CacheEntry => ({
  version: CACHE_VERSION, provider: providerName, query, latitude: null,
  longitude: null, label: null, countryCode: null, status,
  checkedAt: new Date().toISOString(),
});

function geoapifyRowToNormalized(row: Record<string, unknown>): NormalizedResult {
  return {
    lat: String(row.lat ?? ""), lon: String(row.lon ?? ""),
    display_name: String(row.formatted ?? ""),
    address: {
      country_code: String(row.country_code ?? ""),
      house_number: String(row.housenumber ?? ""),
      road: String(row.street ?? ""),
    },
  };
}

function resultFromRow(property: PropertyRow, query: string, row?: NormalizedResult): CacheEntry {
  if (!row) return emptyResult(query, "not_found");
  const latitude = Number(row.lat); const longitude = Number(row.lon);
  const countryCode = row.address?.country_code?.toLowerCase() ?? null;
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
    && isWithinMapArea(latitude, longitude)
    && countryCode === "vn" && isReliableMatch(property, row);
  return { version: CACHE_VERSION, provider: providerName, query, latitude: valid ? latitude : null, longitude: valid ? longitude : null, label: row.display_name ?? null, countryCode, status: valid ? "matched" : "rejected", checkedAt: new Date().toISOString() };
}

async function geocode(property: PropertyRow, query: string): Promise<CacheEntry> {
  const isGeoapify = Boolean(geoapifyKey);
  const url = new URL(isGeoapify ? "/v1/geocode/search" : "/search", providerUrl);
  if (isGeoapify) {
    url.searchParams.set("text", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");
    url.searchParams.set("filter", "countrycode:vn");
    url.searchParams.set("apiKey", geoapifyKey!);
  } else {
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "vn");
    url.searchParams.set("addressdetails", "1");
  }
  try {
    const response = await fetch(url, { headers: { "User-Agent": "KimLanGroup-MapBackfill/1.0 (https://canhodichvu.pro)", Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { results?: Array<Record<string, unknown>> } | Array<NormalizedResult>;
    const rows: NormalizedResult[] = isGeoapify
      ? ((body as { results?: Array<Record<string, unknown>> }).results ?? []).map(geoapifyRowToNormalized)
      : body as Array<NormalizedResult>;
    if (rows.length === 0) return emptyResult(query, "not_found");
    const row = rows.find((candidate) => isReliableMatch(property, candidate)) ?? rows[0];
    return resultFromRow(property, query, row);
  } catch {
    return emptyResult(query, "error");
  }
}

type PendingEntry = {
  property: PropertyRow;
  query: string;
  geocodeQuery?: string;
  matchProperty?: PropertyRow;
  precision?: CacheEntry["precision"];
};

async function geocodeGeoapifyBatch(entries: PendingEntry[], cache: Record<string, CacheEntry>) {
  const batchSize = 500;
  const jobs = await loadBatchJobs();
  let chunks = Array.from({ length: Math.ceil(entries.length / batchSize) }, (_, index) => {
    const chunk = entries.slice(index * batchSize, (index + 1) * batchSize);
    const signature = createHash("sha256").update(chunk.map((entry) => `${entry.property.id}:${entry.geocodeQuery ?? entry.query}`).join("\n")).digest("hex");
    return { chunk, signature, label: `${index + 1}/${Math.ceil(entries.length / batchSize)}` };
  });

  if (resumeOnly && preferSingleExclusion) {
    chunks = chunks.map((item) => {
      if (item.chunk.length > 200) return item;
      for (let index = 0; index < item.chunk.length; index += 1) {
        const candidate = item.chunk.filter((_, candidateIndex) => candidateIndex !== index);
        const signature = createHash("sha256").update(candidate.map((entry) => `${entry.property.id}:${entry.geocodeQuery ?? entry.query}`).join("\n")).digest("hex");
        if (jobs[signature]?.id && jobs[signature].size === candidate.length) {
          console.log(JSON.stringify({ batch: item.label, excluded: item.chunk[index].property.id, resumedSize: candidate.length }));
          return { ...item, chunk: candidate, signature };
        }
      }
      return item;
    });
  }

  // Submit all jobs first so Geoapify's free-capacity queue can process them
  // concurrently. Every job id is persisted before moving to the next one.
  for (const { chunk, signature, label } of chunks) {
    if (jobs[signature]?.id) {
      console.log(JSON.stringify({ batch: label, resumed: chunk.length, status: "pending" }));
      continue;
    }
    if (resumeOnly) {
      throw new Error(`Missing persisted Geoapify job for batch ${label}; resume-only mode will not submit a replacement`);
    }
    const url = new URL("/v1/batch/geocode/search", providerUrl);
    url.searchParams.set("filter", "rect:106.3,10.3,107.1,11.2");
    url.searchParams.set("apiKey", geoapifyKey!);
    const submitted = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk.map((entry) => entry.geocodeQuery ?? entry.query)),
      signal: AbortSignal.timeout(30_000),
    });
    const job = await submitted.json() as { id?: string; status?: string };
    if (submitted.status !== 202 || !job.id) throw new Error(`Geoapify batch submission failed: HTTP ${submitted.status}`);
    jobs[signature] = { id: job.id, submittedAt: new Date().toISOString(), size: chunk.length };
    await writeFile(batchJobsPath, JSON.stringify(jobs, null, 2), "utf8");
    console.log(JSON.stringify({ batch: label, submitted: chunk.length, status: job.status }));
  }

  for (const { chunk, signature, label } of chunks) {
    const jobId = jobs[signature]?.id;
    if (!jobId) throw new Error(`Missing persisted Geoapify job for batch ${label}`);
    let rows: Array<Record<string, unknown>> | null = null;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      if (!resumeOnly || attempt > 1) await wait(60_000);
      try {
        const resultUrl = new URL("/v1/batch/geocode/search", providerUrl);
        resultUrl.searchParams.set("id", jobId);
        resultUrl.searchParams.set("apiKey", geoapifyKey!);
        const response = await fetch(resultUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        if (response.status === 202) {
          console.log(JSON.stringify({ batch: label, poll: attempt, status: "pending" }));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rows = await response.json() as Array<Record<string, unknown>>;
        break;
      } catch (error) {
        console.log(JSON.stringify({ batch: label, poll: attempt, status: "retry", error: error instanceof Error ? error.message : "fetch failed" }));
      }
    }
    if (!rows) throw new Error("Geoapify batch timed out");
    for (let index = 0; index < chunk.length; index += 1) {
      const entry = chunk[index];
      const result = resultFromRow(entry.matchProperty ?? entry.property, entry.query, rows[index] ? geoapifyRowToNormalized(rows[index]) : undefined);
      cache[entry.property.id] = {
        ...result,
        precision: entry.precision ?? "exact",
        geocodedQuery: entry.geocodeQuery ?? entry.query,
      };
    }
    await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    delete jobs[signature];
    await writeFile(batchJobsPath, JSON.stringify(jobs, null, 2), "utf8");
    console.log(JSON.stringify({ batch: label, completed: chunk.length }));
  }
}

async function loadProperties() {
  const properties: PropertyRow[] = [];
  while (properties.length < limit) {
    const pageSize = Math.min(1000, limit - properties.length);
    const from = properties.length;
    const { data, error } = await supabase.from("properties")
      .select("id,house_number,address,ward,district,city")
      .is("latitude", null).is("longitude", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as PropertyRow[];
    properties.push(...page);
    if (page.length < pageSize) break;
  }
  return properties;
}

async function loadAllMissingProperties() {
  const properties: PropertyRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("properties")
      .select("id,house_number,address,ward,district,city")
      .is("latitude", null).is("longitude", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as PropertyRow[];
    properties.push(...page);
    if (page.length < 1000) break;
  }
  return properties;
}

async function recoverCompletedGeoapifyBatches(batchSet: "old" | "new") {
  if (!geoapifyKey) throw new Error("GEOAPIFY_API_KEY is required for batch recovery");
  const cache = await loadCache();
  const jobs = await loadBatchJobs();
  const selectedJobs = Object.values(jobs)
    .filter((job) => batchSet === "old"
      ? job.submittedAt <= "2026-08-21T14:01:40.731Z"
      : job.submittedAt > "2026-08-21T14:01:40.731Z"
        && job.submittedAt <= "2026-08-21T18:39:38.660Z")
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  if (selectedJobs.length !== 6) throw new Error(`Expected 6 ${batchSet} jobs, found ${selectedJobs.length}`);

  const properties = await loadAllMissingProperties();
  const propertiesByQuery = new Map<string, PropertyRow[]>();
  for (const property of properties) {
    const query = fullAddress(property);
    const matches = propertiesByQuery.get(query) ?? [];
    matches.push(property);
    propertiesByQuery.set(query, matches);
  }

  const handledQueries = new Set<string>();
  let resultRows = 0; let unmatchedRows = 0; let duplicateRows = 0;
  let candidates = 0; let matched = 0; let rejected = 0; let updated = 0;
  for (let index = 0; index < selectedJobs.length; index += 1) {
    const job = selectedJobs[index];
    const resultUrl = new URL("/v1/batch/geocode/search", providerUrl);
    resultUrl.searchParams.set("id", job.id);
    resultUrl.searchParams.set("apiKey", geoapifyKey);
    const response = await fetch(resultUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${batchSet} batch ${index + 1}/6 is unavailable: HTTP ${response.status}`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length !== job.size) {
      throw new Error(`${batchSet} batch ${index + 1}/6 returned ${Array.isArray(rows) ? rows.length : "invalid"} rows; expected ${job.size}`);
    }
    resultRows += rows.length;
    for (const row of rows) {
      const query = String((row.query as { text?: unknown } | undefined)?.text ?? "");
      const queryProperties = propertiesByQuery.get(query);
      if (!query || !queryProperties?.length) {
        unmatchedRows += 1;
        continue;
      }
      if (handledQueries.has(query)) {
        duplicateRows += 1;
        continue;
      }
      handledQueries.add(query);
      for (const property of queryProperties) {
        candidates += 1;
        let result = resultFromRow(property, query, geoapifyRowToNormalized(row));
        if (result.status !== "matched" && acceptAlleyEntrances) {
          const entranceProperty = alleyEntranceProperty(property);
          if (entranceProperty) {
            const entranceQuery = fullAddress(entranceProperty);
            const entranceResult = resultFromRow(entranceProperty, query, geoapifyRowToNormalized(row));
            if (entranceResult.status === "matched") {
              result = { ...entranceResult, precision: "alley_entrance", geocodedQuery: entranceQuery };
            }
          }
        }
        cache[property.id] = result;
        if (result.status === "matched" && result.latitude !== null && result.longitude !== null) {
          matched += 1;
          if (apply) {
            const { data: changed, error } = await supabase.from("properties")
              .update({ latitude: result.latitude, longitude: result.longitude })
              .eq("id", property.id).is("latitude", null).is("longitude", null)
              .select("id").maybeSingle();
            if (error) throw error;
            if (changed) updated += 1;
          }
        } else {
          rejected += 1;
        }
      }
    }
    await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    console.log(JSON.stringify({ recoveryBatch: `${index + 1}/6`, rows: rows.length, apply }));
  }
  console.log(JSON.stringify({ recovered: true, batchSet, resultRows, unmatchedRows, duplicateRows, candidates, matched, rejected, updated, apply }));
}

async function recoverCompletedAlleyBatches() {
  if (!geoapifyKey) throw new Error("GEOAPIFY_API_KEY is required for alley batch recovery");
  const cache = await loadCache();
  const jobs = await loadBatchJobs();
  const selectedJobs = Object.values(jobs)
    .filter((job) => job.submittedAt > "2026-08-21T18:39:38.660Z")
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  if (selectedJobs.length !== 3) throw new Error(`Expected 3 alley jobs, found ${selectedJobs.length}`);

  const properties = await loadAllMissingProperties();
  const propertiesByEntranceQuery = new Map<string, PropertyRow[]>();
  for (const property of properties) {
    const entrance = alleyEntranceProperty(property);
    if (!entrance) continue;
    const query = fullAddress(entrance);
    const matches = propertiesByEntranceQuery.get(query) ?? [];
    matches.push(property);
    propertiesByEntranceQuery.set(query, matches);
  }

  const handledPropertyIds = new Set<string>();
  let resultRows = 0; let unmatchedRows = 0; let candidates = 0;
  let matched = 0; let rejected = 0; let updated = 0;
  for (let index = 0; index < selectedJobs.length; index += 1) {
    const job = selectedJobs[index];
    const resultUrl = new URL("/v1/batch/geocode/search", providerUrl);
    resultUrl.searchParams.set("id", job.id);
    resultUrl.searchParams.set("apiKey", geoapifyKey);
    const response = await fetch(resultUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Alley batch ${index + 1}/3 is unavailable: HTTP ${response.status}`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length !== job.size) {
      throw new Error(`Alley batch ${index + 1}/3 returned ${Array.isArray(rows) ? rows.length : "invalid"} rows; expected ${job.size}`);
    }
    resultRows += rows.length;
    for (const row of rows) {
      const entranceQuery = String((row.query as { text?: unknown } | undefined)?.text ?? "");
      const queryProperties = propertiesByEntranceQuery.get(entranceQuery);
      if (!entranceQuery || !queryProperties?.length) {
        unmatchedRows += 1;
        continue;
      }
      for (const property of queryProperties) {
        if (handledPropertyIds.has(property.id)) continue;
        handledPropertyIds.add(property.id);
        candidates += 1;
        const entrance = alleyEntranceProperty(property)!;
        const originalQuery = fullAddress(property);
        const entranceResult = resultFromRow(entrance, originalQuery, geoapifyRowToNormalized(row));
        const result: CacheEntry = {
          ...entranceResult,
          precision: "alley_entrance",
          geocodedQuery: entranceQuery,
        };
        cache[property.id] = result;
        if (result.status === "matched" && result.latitude !== null && result.longitude !== null) {
          matched += 1;
          if (apply) {
            const { data: changed, error } = await supabase.from("properties")
              .update({ latitude: result.latitude, longitude: result.longitude })
              .eq("id", property.id).is("latitude", null).is("longitude", null)
              .select("id").maybeSingle();
            if (error) throw error;
            if (changed) updated += 1;
          }
        } else rejected += 1;
      }
    }
    await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    console.log(JSON.stringify({ alleyRecoveryBatch: `${index + 1}/3`, rows: rows.length, apply }));
  }
  console.log(JSON.stringify({ recoveredAlleyBatches: true, resultRows, unmatchedRows, candidates, matched, rejected, updated, apply }));
}

async function geocodeAlleyEntrances() {
  if (!geoapifyKey) throw new Error("GEOAPIFY_API_KEY is required for alley-entrance fallback");
  const cache = await loadCache();
  const properties = await loadAllMissingProperties();
  const available = properties.flatMap((property): PendingEntry[] => {
    const query = fullAddress(property);
    const prior = cache[property.id];
    const entranceProperty = alleyEntranceProperty(property);
    if (!entranceProperty || !prior || prior.query !== query || prior.status === "matched"
      || prior.precision === "alley_entrance") return [];
    return [{
      property,
      query,
      geocodeQuery: fullAddress(entranceProperty),
      matchProperty: entranceProperty,
      precision: "alley_entrance",
    }];
  });
  const selected = available.slice(0, Math.min(requestedLimit, maxNew));
  console.log(JSON.stringify({ alleyFallbackCandidates: available.length, selected: selected.length, apply }));
  if (selected.length === 0) return;
  await geocodeGeoapifyBatch(selected, cache);

  let matched = 0; let rejected = 0; let updated = 0;
  for (const entry of selected) {
    const result = cache[entry.property.id];
    if (result?.status === "matched" && result.latitude !== null && result.longitude !== null) {
      matched += 1;
      if (apply) {
        const { data: changed, error } = await supabase.from("properties")
          .update({ latitude: result.latitude, longitude: result.longitude })
          .eq("id", entry.property.id).is("latitude", null).is("longitude", null)
          .select("id").maybeSingle();
        if (error) throw error;
        if (changed) updated += 1;
      }
    } else rejected += 1;
  }
  console.log(JSON.stringify({ alleyFallbackDone: true, selected: selected.length, matched, rejected, updated, apply }));
}

async function applyCachedAlleyEntranceResults() {
  if (!apply) throw new Error("--apply-cached-alley-entrances requires --apply");
  const cache = await loadCache();
  const properties = await loadAllMissingProperties();
  let eligible = 0; let updated = 0;
  for (const property of properties) {
    const result = cache[property.id];
    if (result?.precision !== "alley_entrance" || result.status !== "matched"
      || result.query !== fullAddress(property) || result.latitude === null || result.longitude === null
      || !isWithinMapArea(result.latitude, result.longitude)) continue;
    eligible += 1;
    const { data: changed, error } = await supabase.from("properties")
      .update({ latitude: result.latitude, longitude: result.longitude })
      .eq("id", property.id).is("latitude", null).is("longitude", null)
      .select("id").maybeSingle();
    if (error) throw error;
    if (changed) updated += 1;
  }
  console.log(JSON.stringify({ appliedCachedAlleyEntrances: true, eligible, updated }));
}

async function main() {
  if (applyCachedAlleyEntrances) {
    await applyCachedAlleyEntranceResults();
    return;
  }
  if (fallbackAlleyEntrances) {
    await geocodeAlleyEntrances();
    return;
  }
  if (recoverAlleyBatches) {
    await recoverCompletedAlleyBatches();
    return;
  }
  if (recoverOldBatches || recoverNewBatches) {
    await recoverCompletedGeoapifyBatches(recoverNewBatches ? "new" : "old");
    return;
  }
  const cache = await loadCache();
  const properties = await loadProperties();
  const pending: PendingEntry[] = [];
  for (const property of properties) {
    const query = fullAddress(property);
    const result = cache[property.id];
    if (!result || result.version !== CACHE_VERSION || result.provider !== providerName || result.query !== query) {
      if (pending.length < maxNew) pending.push({ property, query });
    }
  }
  const batchEntries = cacheMissesOnly
    ? pending.filter((entry) => !cache[entry.property.id])
    : pending;
  if (geoapifyKey && batchEntries.length > 0) {
    await geocodeGeoapifyBatch(batchEntries, cache);
  }

  let matched = 0; let updated = 0; let failed = 0; let skipped = 0;
  for (let index = 0; index < properties.length; index += 1) {
    const property = properties[index];
    const query = fullAddress(property);
    let result = cache[property.id];
    if ((!result || result.version !== CACHE_VERSION || result.provider !== providerName || result.query !== query) && !geoapifyKey) {
      result = await geocode(property, query);
      cache[property.id] = result;
      await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
      if (index < properties.length - 1) await wait(delayMs);
    }
    if (!result || result.version !== CACHE_VERSION || result.provider !== providerName || result.query !== query) {
      skipped += 1;
      continue;
    }
    if (result.status === "matched" && result.latitude !== null && result.longitude !== null
      && (!isWithinMapArea(result.latitude, result.longitude) || !cachedResultStillReliable(property, result))) {
      result = { ...result, latitude: null, longitude: null, status: "rejected" };
      cache[property.id] = result;
      await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    }
    if (result.status === "matched" && result.latitude !== null && result.longitude !== null) {
      matched += 1;
      if (apply) {
        const { data: changed, error: updateError } = await supabase.from("properties")
          .update({ latitude: result.latitude, longitude: result.longitude })
          .eq("id", property.id).is("latitude", null).is("longitude", null).select("id").maybeSingle();
        if (updateError) throw updateError;
        if (changed) updated += 1;
      }
    } else failed += 1;
    if (!quiet || (index + 1) % 100 === 0 || index === properties.length - 1) {
      console.log(JSON.stringify({ progress: `${index + 1}/${properties.length}`, id: property.id, query, status: result.status, label: result.label, apply }));
    }
  }
  console.log(JSON.stringify({ done: true, provider: providerName, requested: properties.length, geocodedNow: batchEntries.length, matched, failed, skipped, updated, apply }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
