# Zalo Reader architecture

## Goal

Make the Zalo Reader import flow easy to locate, understand, test, and debug without changing its current behavior.

## Current entry points

- Reader import API: `app/api/internal/zalo-reader/import/route.ts`
- Admin import API: `app/api/admin/zalo-imports/**`
- Admin UI: `app/admin/zalo-imports/ZaloImportsClient.tsx`
- Parser: `lib/zalo-import/parser.ts`
- Existing-room resolver: `lib/zalo-import/resolve.ts`
- Quality and auto-import rules: `lib/zalo-import/quality.ts`
- Pending-room publisher: `lib/zalo-import/publish-pending-room.ts`
- Temporary R2 helpers: `lib/r2/zalo-temp.ts`

## Problem

`app/api/internal/zalo-reader/import/route.ts` currently owns too many responsibilities:

1. Internal-secret authentication
2. Request parsing and sanitizing
3. Duplicate detection
4. Room parsing
5. Existing-room resolution
6. Image processing and R2 upload
7. Video and thumbnail download/upload
8. Supabase persistence
9. Import diagnostics
10. Quality scoring
11. Auto publishing
12. HTTP response and error formatting

This makes a single failure difficult to locate and makes safe changes expensive.

## Target structure

```text
app/api/internal/zalo-reader/import/route.ts

lib/zalo-reader/
├── import-service.ts
├── request.ts
├── media.ts
├── repository.ts
├── parser.ts
├── quality.ts
├── publisher.ts
└── types.ts
```

## Responsibility rules

### `route.ts`

Only:

- validate internal secret
- decode the HTTP request
- call `importZaloMessage`
- convert service results/errors to `NextResponse`

It must not query Supabase or upload media directly.

### `import-service.ts`

The single orchestration flow:

```text
validate input
→ find duplicate
→ parse room
→ resolve existing room
→ create pending batch
→ save media
→ update diagnostics
→ evaluate quality
→ optionally publish
→ return result
```

### `request.ts`

Contains request-only helpers:

- request input normalization
- PostgREST-safe JSON conversion
- source hash creation
- reader issue normalization
- numeric input normalization

### `media.ts`

Contains all image/video behavior:

- Base64 decoding
- remote Zalo URL validation
- remote media download with timeout and size limits
- MIME normalization
- temporary R2 key generation
- image/video/thumbnail upload

### `repository.ts`

The only module that directly works with Zalo import tables:

- find duplicate batch
- create import batch
- save image rows
- save video rows
- update parser result and diagnostics
- create/update pending room

Room publishing may keep using `publisher.ts` because it writes final room tables and moves permanent media.

### `parser.ts`

Keep parsing rules together in one searchable file. Do not split every field into a separate parser file unless the main parser becomes impossible to navigate.

Use clear sections:

1. normalization
2. room code
3. money and fees
4. address
5. amenities and policy
6. main parser

### `types.ts`

Shared contracts only:

- `IncomingZaloMessage`
- `IncomingImage`
- `IncomingVideo`
- `ImportIssue`
- `ImportStage`
- `ImportResult`
- media persistence types

## Debug logging

Every import should use one trace ID and five stable stages:

```text
[ZR:<traceId>][request]
[ZR:<traceId>][parser]
[ZR:<traceId>][media]
[ZR:<traceId>][database]
[ZR:<traceId>][publish]
```

Logs should contain IDs and counts, not full Base64 data or secrets.

Example:

```text
[ZR:8d3f2c][request] accepted group="Group A" images=4 videos=1
[ZR:8d3f2c][parser] completed confidence=92 roomCode="301"
[ZR:8d3f2c][media] completed images=4 videos=1 issues=0
[ZR:8d3f2c][database] pending batch created batchId="..."
```

## Migration sequence

Each phase should preserve current API request and response shapes.

### Phase 1 — low risk

- create `lib/zalo-reader/types.ts`
- create `lib/zalo-reader/request.ts`
- move pure request/sanitizing helpers out of `route.ts`
- add trace-based logging

### Phase 2 — medium risk

- create `lib/zalo-reader/media.ts`
- move URL validation, download, MIME and R2 upload helpers
- keep database inserts in the existing route temporarily

### Phase 3 — medium risk

- create `lib/zalo-reader/repository.ts`
- move all Zalo import batch/media persistence
- make persistence methods return explicit typed results

### Phase 4 — orchestration

- create `lib/zalo-reader/import-service.ts`
- move the main workflow from the route into the service
- reduce `route.ts` to HTTP-only code

### Phase 5 — cleanup

- move active modules from `lib/zalo-import` to `lib/zalo-reader`
- update imports
- remove or archive `parser.before-*` and `zalo-reader.before-*` snapshots because Git already preserves history
- remove obsolete test endpoints after confirming they are unused

## Required checks for every phase

- TypeScript typecheck
- lint
- parser smoke tests
- duplicate message import
- image-only import
- video import with thumbnail
- partial media failure
- invalid secret
- malformed JSON
- manual approve
- reject/remove pending import
- auto-import dry run
- auto publish when eligible

## Non-goals

This refactor must not initially change:

- parser output fields
- database schema
- API request/response shape
- quality score rules
- admin approval behavior
- media size limits
- R2 object paths
- auto-import eligibility

Behavior changes should be proposed in separate pull requests after the architecture is stable.
