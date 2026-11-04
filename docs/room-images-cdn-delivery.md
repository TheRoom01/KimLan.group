# Reliable room image delivery

Production `/_next/image` requests returned HTTP 402 with
`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. The same source images returned 200
from the CDN; localhost's image processor also worked. This is a Vercel image
service billing/availability failure, not proof that the source files were lost.

## Changes

- Room cards now use direct CDN media by default. Existing media is already
  compressed WebP; five sampled files were 59–130 KB and returned
  `Cache-Control: public, max-age=31536000, immutable`.
- Existing lazy loading, eager first cover, async decoding, fixed collage
  dimensions, image order, browser/CDN cache and scroll restoration are retained.
  No data or full-resolution detail/gallery images are changed.
- Vercel room-card optimization is explicit opt-in via build-time
  `NEXT_PUBLIC_ROOM_CARD_IMAGE_OPTIMIZATION=true`. Keep this unset while the
  image service rejects requests. No plan/billing setting is changed.
- If optimization is enabled later and fails, `RoomCardImage` tries the same
  original directly before notifying RoomCard that the source is unavailable.
- Placeholders and the public static logo bypass optimization. Actual missing
  images use the existing fallback UI, skip duplicate primary/fallback URLs, and
  never retry indefinitely. Failed-source state is tied to source URLs, so fresh
  room images recover without remounting the list.

## Validation

`npm run test:room-images` uses actual components and offline image responses to
cover direct default delivery without optimizer requests, optional optimizer 402
fallbacks, true source 404s, bounded requests, recovery after source changes,
offscreen lazy loading and stable layout. `test:room-card` retains address/copy and
source order checks. Build/typecheck and list-scroll regression run separately.

Direct compressed WebP can transfer more bytes than a working small responsive
rendition. This removes failing optimizer round trips and retains cache/lazy-load
benefits; it is not a claim of zero lag on every network or device. The existing
CDN resize URL returned 404, so no unsupported resize path or new proxy/server
transformation service is introduced. Room thumbnails can be developed further
as pre-generated per-image assets in a separately scoped change.
