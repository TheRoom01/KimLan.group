# Room-list scroll optimization

Branch: `perf/optimize-room-list-scroll`.

This report describes the scroll-optimization task. A subsequent, explicitly
authorized recommendations change on the same branch adds a dedicated RPC;
see `room-recommendations-update.md` for that separate scope and DB verification.

Baseline: `main` / `origin/main` at `2af71f32f3201153dd123e0da52d2dff1e363b25`.
The worktree was clean before branching. No database/RPC/migration, Reader,
live-import, production deployment, push, or main update is part of this change.

Files changed/added:

- `app/HomeClient.tsx`
- `components/RoomCard.tsx`
- `lib/rooms/cardImages.ts`
- `tools/performance/room-list-scroll.test.ts`
- `tools/performance/room-card.test.ts`
- `tools/performance/performance-regression-smoke-test.mjs`
- `package.json`
- `.gitignore`
- `docs/room-list-scroll-performance.md`

## Existing restoration flow, reviewed before changes

1. `lastScrollTopRef`, page/display refs and cursor refs hold current list state.
2. `history.state.__listScroll` stores offsets keyed by canonical list URL (with
   cursor excluded), throttled at 600 ms.
3. `HOME_STATE_LITE_V2::<qs>` stores filters, page, cursor and scroll, without
   room data; it is a per-query fallback with a 30-minute TTL.
4. `HOME_STATE_V3` stores filters, all cached pages, cursors, page and scroll.
5. `HOME_BACK_SNAPSHOT_V2` captures all list state before opening details and
   on pagehide/visibilitychange; `HOME_BACK_HINT_V1` identifies return navigation.
   The back snapshot/hint TTL is 15 minutes.
6. Hydration prefers a matching back snapshot, then a matching full cache, then
   Lite, then URL/SSR. Reload/default-Home, dirty/force-refresh, auth changes and
   stale-response guards have their own existing behavior.
7. `pageshow.persisted` and `popstate` restore through these same readers.
   The original final scroll application waited for two animation frames.

These keys, TTLs, readers, filter signatures, invalidation and fallback order
remain in place. Existing cache written before this change is still readable.

## Changes

### HomeClient

- The scroll callback updates the offset ref/history and schedules only a small
  Lite write, bounded by a 200 ms timer. It never calls full-list persistence.
- Full list persistence runs on data/filter changes and navigation/lifecycle
  boundaries. New/prefetched data is persisted without requiring a scroll.
- Opening a card flushes history and captures the exact current snapshot,
  including keyboard/programmatic activation and immediate navigation before
  the position-write timer fires. A pending history throttle is cancelled.
- A ref supplies current persistence callbacks without changing the navigation
  callback passed to every memoized card on each filter keystroke.
- Hydration and pending-scroll application use layout effects so cached list
  restoration happens before paint. A pending offset remains pending while the
  fallback page is loading. Baseline tests exposed visible frames containing
  page zero/offset zero; the optimized tests reject either condition.

### RoomCard images

- Known, already-allowed public image hosts and local images use Next Image's
  responsive renditions/cache. Unknown legacy hosts keep direct loading.
- The source URL order, video-thumbnail selection and error fallbacks are kept.
  No room-detail/gallery source code or original media is changed.
- Lazy images use `sizes="auto, …"`, letting supporting browsers choose from
  the image's actual layout width, including single-result grids and mobile
  two-column cards. A conservative pixel fallback preserves clarity on older
  browsers. The first cover remains eager, with a conservative responsive hint.
- `loading` and async decoding remain intact. Fixed gallery aspect ratio remains.
- `auto` is only used for lazy images, per the
  [HTML sizes specification](https://html.spec.whatwg.org/multipage/images.html).

### Address and styling

- One Range measures line fragments instead of a Range/layout read per character.
- ResizeObserver watches the container and text; the duplicate window resize
  listener is removed. Copy behavior, clamping and button placement are retained.
- No CSS, backdrop-filter, shadow, card dimensions or visual design is changed.
  Headless frame measurements are insufficient evidence for changing these.

## Regression coverage

The tests bundle the actual HomeClient, FilterBar, RoomList, RoomCard and Next
Image with generated application CSS. Supabase, analytics, Next navigation and
unrelated modal/admin components are mocked. Local HTTP fixtures handle image
and document requests. They never call a live import or real database.

- Main and optimized sources are tested with the same synthetic data and CSS.
  Baseline source is read using `git show main:<file>`; main is never checked out
  or edited to run the baseline.
- Desktop 1366×900 and mobile 390×844.
- Search input changes, explicit price range, district, type, status, features,
  price sorting, paging to page index 4 and retained ordered IDs.
- Browser Back and in-app Back after a component unmount/remount.
- Per-frame offset **and first-room identity**, rejecting a transient page-zero
  list or offset zero on the optimized return path.
- No page-zero refetch on return to a cached page.
- Matching full-cache and Lite readers are also exercised after removing the
  preferred snapshot. Both restore offset 999 on page index 2 without fetching
  page zero. Default Home without query filters is covered separately.
- Full-document navigation with actual Chromium BFCache:
  `pageshow.persisted === true`, identical list/filters/offset after Back.
- Short/clamped addresses at 400/360/290 px, full clipboard text and copy-button
  coordinates equal to main (within 1 px).
- Actual Next Image DOM: responsive srcset, preserved source order, lazy/async
  attributes, layout-sized lazy image selection and unknown-host compatibility.

Commands (build or a generated dev CSS bundle must exist first):

```text
npm run test:room-list-scroll -- --baseline
npm run test:room-list-scroll
npm run test:room-list-scroll -- --fallbacks-only
npm run test:room-card -- --baseline
npm run test:room-card
npm run test:performance
npx tsc --noEmit --incremental false
npm run build
```

Use full Chromium for the BFCache test. Playwright's headless shell explicitly
disables BFCache for its delegate; a simulated pageshow event is not substituted
for this test. The test uses real history navigation rather than waiting for a
new load event on a restored document.

Generated JSON, screenshots, build and lint reports live under the ignored
`.cache/room-list-performance/` directory. Raw byte counts below estimate
UTF-16 string size (`length * 2`), not disk usage or compressed traffic.

## Measurements

One sequential fixture comparison, 45 animation frames, five visited/cached
pages plus next-page prefetch, after changing the search and explicit filters:

| Metric | main | optimized |
| --- | ---: | ---: |
| Desktop full-list writes during scroll | 44 | 0 |
| Desktop small writes during scroll | 44 | 10 |
| Desktop estimated bytes written | 7,599,088 | 11,354 |
| Desktop synchronous storage write time | 298.5 ms | 0.8 ms |
| Mobile full-list writes during scroll | 44 | 0 |
| Mobile small writes during scroll | 44 | 7 |
| Mobile estimated bytes written | 7,599,112 | 7,950 |
| Mobile synchronous storage write time | 289.2 ms | 0.4 ms |
| Desktop frame interval p95 | 114.4 ms | 125.4 ms |
| Mobile frame interval p95 | 71.6 ms | 45.3 ms |
| Character-level address geometry reads | 774 | 0 |
| Line-fragment address geometry reads | 0 | 9 |

Storage time excludes stringify itself. Byte reduction is approximately 99.85%
on desktop and 99.90% on mobile in this fixture. Main's return-frame samples
included page zero and offset zero; optimized samples all contained page index 4
at offset 1876 px. BFCache ran on both versions (`[false, true]` pageshow flags).
On default Home, non-pointer card activation followed by Back returned to offset
0 on main and the expected 999 px on the optimized branch. Both full-cache and
Lite fallback readers passed on main and optimized. The new navigation capture
also fixes this keyboard/programmatic activation gap in main's pointer-only
snapshot path.

These are synthetic measurements, not production FPS or field Core Web Vitals.
Desktop p95 did not improve in this run. Do not infer a universal frame-rate
improvement from the storage reduction; software rendering, blur and host load
remain substantial factors. Real-device traces, especially iOS Safari, are
still required before claiming production scroll smoothness.

An existing 1024×768 CDN image (24,938 bytes) was also read through the actual
localhost Next Image endpoint: 384px/7,118 bytes, 640px/15,219 bytes and
256px/4,013 bytes with the default non-browser Accept header (JPEG output).
This validates actual resizing, independently of the synthetic image fixture.
Dev responses are revalidated; they are not a measurement of production CDN
cache behavior. No media was uploaded or modified.

## Validation and remaining risks

- Scroll and RoomCard browser regressions: PASS against main's source.
- Existing smoke suite: 5/5 PASS. Two stale CSS-string assertions that already
  failed against main were updated to the current address markup/clamp behavior.
- TypeScript: PASS. Production build: PASS (compile, TypeScript and static pages).
- Project lint is not clean: 1,198 errors / 160 warnings across source. In the
  changed HomeClient/RoomCard, main and optimized have the same 62 errors and
  25 warnings combined, with no new diagnostic messages. Helper/new tests pass.
- Next Image introduces resize/cache work on a cold variant and can consume
  hosting image-optimization quota. Monitor warm/cold requests after deployment.
- Older browsers without auto-sizes use conservative fallbacks and may fetch
  larger images. Unknown legacy hosts intentionally remain unoptimized.
- Tests mock the Next router and data services; live authenticated flows,
  intercepted Next modal navigation, real content variation and iOS hardware
  performance are not full end-to-end production measurements.
- Storage quota failure retains the existing Lite/URL fallback, which can
  require data fetching. Exact cached restoration cannot be promised if the
  browser refuses all cache writes or cache is intentionally invalidated.

Before merging, manually check localhost:3000 with the intended account:
filter/sort → later page → scroll → open detail by mouse and keyboard → browser
Back/app Back; repeat on mobile and after an actual BFCache traversal. Inspect
Network for correct image rendition/cache, and Performance for long tasks,
paint and dropped frames. No merge/push/deployment is authorized by this change.
