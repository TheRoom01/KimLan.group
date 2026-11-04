# Public light theme and filter layout

Branch: `feat/light-theme-filter-layout`.

The branch was created from the existing performance branch with its working
changes preserved. No commit, push, merge, website deploy or database/RPC/data
change was performed for this UI task. Main remains at
`2af71f32f3201153dd123e0da52d2dff1e363b25`.

## Changes in this task

- `lib/publicTheme.ts`, `components/ThemeToggle.tsx`, `app/layout.tsx`:
  synchronous head bootstrap, persisted explicit choice, cross-tab updates,
  existing dark default, independent accessible toggle without remounting Home.
- `app/public-theme.css`: scoped latte/cream palette, glass header/footer with
  a 12px blur and solid fallback, compact responsive header, two-column mobile
  grid including 360px, compact filter panel and centered reset.
- `components/FilterBar.tsx`: local visibility state and a stable hidden panel;
  all existing filter controls, debounce and handlers remain mounted.
- `components/RoomList.tsx`, `app/HomeClient.tsx`: reset uses the existing Home
  reset function, beside the actual total; logo, auth and notification conditions
  remain intact. Theme does not touch scroll/cache logic.
- `components/RoomCard.tsx`: CSS-variable text defaults, unchanged collage/data/
  actions; suppress only the expected server/client relative-time text mismatch.
- `app/rooms/[id]/RoomDetailClient.tsx`: original theme values become variable
  fallbacks; a content hook scopes light text and preserves media controls.
- `components/AuthControls.tsx`: one style hook on the existing account portal.
- `components/rooms/RoomRecommendations.module.css`: light text/control colors.
- `tools/performance/public-theme-layout.test.ts`, `package.json`: reproducible
  browser regression script `npm run test:public-theme` with offline data.
- `.gitignore`: exclude local QA screenshots, logs and pre-edit safety copies.

Room shortcut badges and their selected states keep their existing colors.
Room availability hues remain distinct. No heavy dependency was introduced.

## Verification

- Browser fixture: both themes, panel closed/open, widths 360/390/430/1366/1920;
  no horizontal overflow, 2 mobile columns and 5 columns at 1920px, centered reset,
  search/filter/reset/pagination, original badge colors, notifications and login.
- Panel visibility causes no extra list query or URL/data change. Theme changes
  preserve the same list DOM, room order, URL, page and div scroll offset.
- Reload retains theme. In-app Back retains position. Existing regression also
  passes real BFCache and full/Lite/default cache fallbacks (999px retained).
- Actual localhost preview: real room images/data, light/dark desktop/mobile,
  closed/open panel, detail sheet colors #FFFDFA/#3F352E, no browser page errors
  in the recorded run, closing detail retains 600px -> 600px.
- Production build and TypeScript checks run. Lint on the edited legacy files
  has 92 existing errors and 49 warnings; fingerprint comparison with pre-edit
  copies shows no new findings. New theme/test files lint clean.

Screenshots and raw logs are in `.cache/light-theme/`; `preview-*` files use
real localhost room data. The developer status badge was hidden for screenshots
only. Offline fixtures do not represent production query latency.

## Limits

Authenticated account/notification permissions were not exercised against a live
signed-in account. Notification dropdown functionality uses the actual component
with offline responses; existing authorization conditions were left unchanged.
The shared database was not modified or imported into during this task.
No production performance gain is claimed from these functional/UI checks.

## Palette and header follow-up

At the user's request, light cards now use cream beige `#F4E5D2` and the page
background uses warmer brown latte `#CBB094`. Other surface defaults and the dark
theme remain unchanged.

`components/HeaderNotifications.tsx` keeps a bell visible in the public header.
The old Home condition hid the bell entirely for guests; the new public button
shows a sign-in prompt without requesting any Admin notifications. Verified
signed-in L1/L2 still render the existing AdminNotificationCenter, with its unread
count, dropdown and API permission enforcement intact. Non-admin accounts do not
request the Admin endpoint. Browser fixtures now exercise both guest and signed-in
Admin header paths instead of injecting a separate bell into the fixture header.

## Unified district/amenity choices

`components/FilterChoicePanel.tsx` now supplies the same shell for district and
amenity choices. Shared header/Clear/close controls stay outside a single native
scroll area. Both panels use identical checkbox styling, scrollbar styling,
touch-action/overscroll containment, padding, borders and close behavior. Movement
choices retain exclusive radio semantics while using the same visual tick style.

Panels are positioned against the trigger and clamped to the visual viewport,
below the sticky header and above fixed pagination. They may open above the
trigger when needed and recalculate after resize/rotation/keyboard viewport
changes. Internal scroll does not close the panel; Escape and explicit close
return focus to the trigger. Outside taps close without clearing selections.
Amenity filters still apply immediately and Clear retains its existing reset scope.

Browser regression covers both panels/themes at 360x640, 390x844, 430x932,
844x390, 1366x768 and 1920x1080, including wheel scrolling, actual native touch
swipes via Chromium touch events, stationary headings, filter checks and Clear,
Escape/close/outside tap, and viewport/footer bounds. Actual localhost screenshots
are `.cache/light-theme/amenities-{light,dark}-{390,1920}.png` and matching
`district-*` files. No DB/API authorization/import changes are involved.

## Release authorization

After reviewing the changes, the user explicitly requested merging all changes
from this work into main and deploying production. This later instruction
supersedes the earlier no-merge/no-deploy constraint for this release. Local QA
artifacts are excluded from the deployment bundle through `.vercelignore`.
