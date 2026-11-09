import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Home keeps SSR data and does not repeat retired public RPCs", async () => {
  const [page, client, roomCard, publicCache, serverFetcher] = await Promise.all([
    read("app/page.tsx"),
    read("app/HomeClient.tsx"),
    read("components/RoomCard.tsx"),
    read("lib/rooms/publicCache.ts"),
    read("lib/fetchRoomsServer.ts"),
  ]);

  assert.doesNotMatch(page, /get_public_filters/);
  assert.match(client, /pagesRef\.current = \[initialRooms \?\? \[\]\]/);
  assert.match(client, /initialPageUsable && pageFromUrl === 0 && makeFilterSigValue\(url\.filters\) === initialFilterSig/);
  assert.match(client, /const urlStatus = url\.st/);
  assert.match(client, /priceFilterActive \? minPriceApplied : undefined/);
  assert.doesNotMatch(client, /flushSync/);
  assert.doesNotMatch(client, /prefetchRoomDetail/);
  assert.match(client, /initialAnonExpiresAt/);
  assert.match(client, /setGeneralInquiryOpen\(true\)/);
  assert.match(client, /inert=\{isAnonLocked/);
  assert.doesNotMatch(client, /anon_session_id_v1|localStorage[\s\S]{0,80}anon/i);
  assert.match(roomCard, /<Link\s+[\s\S]*?href=\{href\}/);
  assert.match(roomCard, /home-room-address pointer-events-none relative z-20/);
  assert.match(roomCard, /WebkitLineClamp: 2/);
  assert.match(roomCard, /pointer-events-auto absolute bottom-0 z-30/);
  assert.match(roomCard, /current\?\.id === toastId \? null : current/);
  assert.match(page, /readHomeListFilters\(key =>/);
  assert.match(page, /minPrice: filters\.priceFilterActive \? filters\.priceApplied\[0\] : null/);
  assert.match(page, /maxPrice: filters\.priceFilterActive \? filters\.priceApplied\[1\] : null/);
  assert.doesNotMatch(publicCache, /start_anon_session/);
  assert.match(publicCache, /getAnonymousHomeAccess/);
  assert.match(publicCache, /createSupabaseAdminClient/);
  assert.match(serverFetcher, /roomListFilterRpcParams\(params\)/);
});

test("room detail is role-aware server loaded with a secure client fallback", async () => {
  const [page, client, cache, video] = await Promise.all([
    read("app/rooms/[id]/page.tsx"),
    read("app/rooms/[id]/RoomDetailClient.tsx"),
    read("lib/rooms/publicCache.ts"),
    read("components/media/RoomMediaVideo.tsx"),
  ]);

  assert.doesNotMatch(page, /^"use client"/);
  assert.match(page, /getRoomDetailForRender/);
  assert.match(page, /privateDetailLoaded/);
  assert.match(cache, /getRoomDetailForRender = cache/);
  assert.match(cache, /auth\.getClaims\(\)/);
  assert.match(cache, /get_my_admin_level/);
  assert.match(cache, /fetch_room_detail_full_v1/);
  assert.match(cache, /room: await getPublicRoomDetail\(id\)/);
  assert.match(client, /fetch_room_detail_full_v1/);
  assert.match(client, /activeRoomIdRef\.current !== requestRoomId/);
  assert.doesNotMatch(client, /\.from\("rooms"\)/);
  assert.doesNotMatch(cache, /unstable_cache/);
  assert.match(video, /controlsList="nofullscreen"/);
  assert.doesNotMatch(video, /requestFullscreen|toggleFullscreen|Maximize|Minimize/);
  assert.match(client, /right-3 top-16[\s\S]*aria-label="Mở media toàn màn hình"/);
});

test("owner and sales list payloads exclude unused heavy relations", async () => {
  const [owner, sales] = await Promise.all([
    read("lib/owner/getOwnerRooms.ts"),
    read("lib/sales-portal/getSalesPortalData.ts"),
  ]);

  assert.doesNotMatch(owner, /room_media\s*\(/);
  assert.doesNotMatch(owner, /cccd_front_path|cccd_back_path/);
  assert.doesNotMatch(sales, /room_details\(\*\)/);
});

test("sales modal and fullscreen participate in browser back history", async () => {
  const salesPortal = await read("components/sales/SalesPortalView.tsx");

  assert.match(salesPortal, /SALES_ROOM_MODAL_HISTORY_KEY/);
  assert.match(salesPortal, /SALES_MEDIA_FULLSCREEN_HISTORY_KEY/);
  assert.match(salesPortal, /window\.history\.pushState/);
  assert.match(salesPortal, /window\.addEventListener\("popstate", syncRoomModalWithHistory\)/);
  assert.match(salesPortal, /window\.addEventListener\("popstate", syncFullscreenWithHistory\)/);
});

test("anonymous requests bypass auth/device network work in proxy", async () => {
  const proxy = await read("proxy.ts");
  const cookieGuard = proxy.indexOf("if (!hasAuthCookie && !hasBearerToken)");
  const authCall = proxy.indexOf("supabase.auth.getUser()");

  assert.ok(cookieGuard >= 0);
  assert.ok(authCall > cookieGuard);
  assert.match(proxy, /httpOnly: true/);
  assert.match(proxy, /createAnonymousHomeSessionToken/);
});
