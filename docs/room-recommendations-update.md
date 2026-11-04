# Final-page recommendations

Implemented on `perf/optimize-room-list-scroll`, preserving the existing scroll
optimization changes. Main is not modified, merged or pushed. No website deploy
or Reader/live import is part of this task.

## Behavior

- Mount recommendations only on the settled final page of the filtered list.
  Forty matches show them on page 2; fifty on page 3. Loading, stale-filter,
  saved-room and error states continue to suppress the block.
- Exclude the **entire** original filter result in SQL before the recommendation
  LIMIT. This does not depend on which pages have been visited or on 20 visible
  IDs. Original price bounds, district/type aliases, statuses, amenities and
  anon/admin search semantics are kept separate from recommendation expansion.
- Return at most 20 public eligible rooms. The existing maximum-price expansion
  of +2,000,000 VND remains. There can be fewer than 20, or no block, if there
  are insufficient candidates outside the original filter; no duplicates are
  inserted merely to fill the rail. A district-only filter may have no outside
  candidates when every eligible recommendation already belongs to that filter.
- Reduce list bottom padding only while this block is eligible. Remove the
  outer section's outline, background header panel and shadow, and reduce the
  top/header spacing. Preserve card theme, widths, actions and footer clearance.
- Mouse dragging on the cards scrolls the horizontal rail. A movement threshold,
  pointer capture and click suppression prevent accidental room navigation.
  Buttons, copy actions and nested toolbar/amenity rails retain their behavior;
  touch scrolling, arrow controls and keyboard scrolling remain available.
- Fix prefetch updating the current page's `hasNext`: only a visible-page
  response may set that state, so prefetching the final page cannot disable
  Next on the preceding page.

## Authorized database scope

The user explicitly authorized a dedicated recommendation RPC update after the
earlier task prohibited DB changes. Migration applied to shared project
`vgmtiymubuwztqdxsexn`:

`20261104183140_room_recommendations_final_page_exclusion.sql`

This adds `fetch_room_recommendations_v2` only; v1 remains available for the
currently deployed website. No table, main-list RPC, policy or room data changes.
Local filename/version is synchronized with Supabase migration history.

The new function uses security invoker, an empty search_path and service-role-only
EXECUTE. The API derives admin search semantics from the signed cookie session
and DB admin level, ignoring client-supplied roles. Private address hydration
still independently verifies admin membership and now covers all 20 IDs.

The original Home membership predicates were copied from the live
`fetch_rooms_cursor_full_v1` during this migration. Future changes to Home's
filter/search SQL must keep the v2 complement in sync.

## Validation

- Disposable PostgreSQL: all 50 matching rooms excluded even with only 20 IDs
  supplied; 20 novel results; no-price/all-matching case returns none; raw vs
  expanded district aliases and private admin address searches are distinguished.
- Existing v1 tests still pass (public eligibility, all filters, radius/GPS,
  media, ordering and permissions), including a 15,000-row disposable fixture.
- API fixtures: original vs expanded bounds, anon/L1/L2 and forged-role rejection.
- Browser fixture: 20 cards, matching main-card appearance at desktop/mobile
  widths, drag without navigation, click/actions after drag, keyboard/arrows,
  reduced gap, frameless section, scoped cache, retry/abort and empty results.
- Unit cases cover 40/50 matches, stale display pages and incorrect prefetch
  `hasNext` signals.
- Scroll restoration regression still passes (real BFCache, remount, full/Lite
  fallback and default Home).
- Shared DB read-only verification: Quận 5 sample returned 20 recommendations,
  **0 overlaps** with the original 3–5 million filter, and public active rooms
  only. Anon/authenticated EXECUTE is false, service_role is true, and the
  function is not security definer. Security advisor counts are unchanged.

Run `npm run test:room-recommendations` using the existing disposable PGlite
runtime in this workspace. No test imports live rooms or invokes the Reader.
Preview UI at localhost:3000. Website production requires a separate deployment
after review; the DB addition alone does not deploy this UI/API.
