# Task 4 Report

## Status

Complete. `/read/[publisherId]/[bookId]` now loads a client-only `react-pageflip` reader with metadata and image retry states, responsive portrait/spread behavior, canonical `?page=N` sync, controls, guarded keyboard shortcuts, and accessible responsive styling.

## Files

- `src/app/read/[publisherId]/[bookId]/page.tsx`: client route boundary; passes route IDs and initial page; disables SSR for flipbook module.
- `src/components/book-reader.tsx`: API loading/error/retry, metadata validation, flipbook lifecycle, media-query rebuild, controls, keyboard handling, URL sync.
- `src/components/book-page.tsx`: forwarded page ref, page image state, non-draggable image, stable error placeholder and retry.
- `src/lib/reader.ts`: pure metadata validation and typing-target guard.
- `src/lib/reader.test.ts`: focused tests for malformed/empty metadata and keyboard target safeguards.
- `src/app/globals.css`: viewport-fitting reader, page aspect containment, safe areas, reachable controls, focus states, mobile reflow, image failure dimensions, reduced-motion inheritance.

## TDD Evidence

RED:

```text
npm test
Error: Cannot find module './reader'
pass 34, fail 1
```

GREEN:

```text
npm test
pass 38, fail 0
```

New tests cover:

- valid metadata acceptance
- empty, inconsistent, and malformed metadata rejection
- `input`, `textarea`, `select`, and contenteditable keyboard exclusion
- normal non-editable target acceptance

## Verification

```text
npm test && npm run lint && npm run build
38 tests passed
eslint exited 0
Next.js production build exited 0
```

Build routes:

```text
○ /
ƒ /api/books/[publisherId]/[bookId]
ƒ /read/[publisherId]/[bookId]
```

Runtime probes:

```text
GET /read/iehyo/byxp?page=9999 -> 200
GET /api/books/iehyo/byxp -> 200
Kesetiaan Mr. X. by Keigo Higashino, 324 pages, 324 URLs
```

Contrast checks:

```text
#aaa79e on #10100f: 7.91:1 PASS
#e5b94e on #10100f: 10.32:1 PASS
#171612 on #eeece4: 15.31:1 PASS
```

Other checks:

- `git diff --check`: clean
- added-line security scan: no secrets, eval/exec, unsafe HTML, or shell execution
- browser harness daemon failed to start
- direct headless Chrome captured client loading boundary, but timed out before reliable loaded-reader/mobile captures; no visual claim based on that incomplete run

## Self-review

- API payload is validated before use; empty pages fail into retryable metadata error.
- Fetch aborts on unmount and retry preserves route IDs and initial query.
- Initial page uses existing `normalizePage`; canonical page replaces invalid/clamped query.
- Flip events use zero-based to human-page conversion and `replaceState`.
- Portrait query exactly matches `(orientation: portrait) and (max-width: 767px)`; key rebuilds flipbook on changes.
- Arrow shortcuts ignore requested editable targets.
- Controls use native buttons/input, visible focus, labels, live status, disabled bounds, 44px minimum targets.
- Image retry changes URL key and keeps page box dimensions.
- Design continues existing Pagekeeper dark paper/gold identity. ENERGY 1 / RHYTHM 1 / MOTION 1; reader content remains focal point.

## Commits

- Implementation: `2d83a0d87cafdad2e243a36cde02e0c72385fa25`
- Report: `813df8ed13b29803637852cd816b1a71b2439d80`

## Concerns

- Automated loaded-state visual verification remains incomplete because browser-use daemon failed and local headless Chrome stalled after capturing loading boundary. Static build, live HTTP/API probes, and contrast checks passed.
- `react-pageflip` exposes an untyped `any` ref/event API; local narrow handle/event types constrain usage but cannot improve dependency internals.

## Fix Round 1

Status: complete.

Changes:

- Added callback-ref cleanup that calls the underlying PageFlip `destroy()` before keyed orientation replacement or reader unmount. Cleanup clears `bookRef` only when it still points at the destroyed handle, preserving a newer mounted instance.
- Added pure `isLastSpread` logic. Odd-count landscape final spreads now disable Next when the visible leading page is `pageCount - 1`; URL and status continue storing that leading page. Portrait and even-count behavior stays unchanged.
- Keyboard shortcuts now ignore repeated `keydown` events.
- Added focused tests for odd/even portrait/spread boundaries and destroy/ref replacement safety.

TDD evidence:

```text
RED focused test: 38 passed, 2 failed
- isLastSpread is not a function
- destroyFlipBook is not a function

GREEN focused test: 40 passed, 0 failed
```

Verification:

```text
npm test          40 passed, 0 failed
npx tsc --noEmit  exited 0
npm run lint      exited 0
npm run build     exited 0
```

Build routes remained:

```text
○ /
ƒ /api/books/[publisherId]/[bookId]
ƒ /read/[publisherId]/[bookId]
```

Other checks:

- `git diff --check`: clean
- Cleanup behavior covered at pure helper seam; no browser-level listener-count assertion added because dependency stores PageFlip instance internally and exposes no listener diagnostics.

Concerns:

- `react-pageflip` 2.0.3 still omits its own unmount cleanup. Local callback-ref cleanup intentionally compensates while component uses this dependency version.

## Fix Round 2

Status: complete.

Changes:

- Removed orientation-keyed `HTMLFlipBook` remounting and callback-ref cleanup. Reader now keeps one `react-pageflip` instance for its mounted lifetime and never calls `PageFlip.destroy()` from React ref cleanup.
- Set stable `usePortrait={true}` so PageFlip's resize renderer chooses portrait or landscape from container width in place. Portrait phone CSS caps book width at 479px, below the library's 480px two-page threshold; landscape and desktop retain spread sizing.
- Kept media-query state only for `isLastSpread` control semantics. No construction-only PageFlip prop changes after mount.
- Stabilized `startPage` from normalized route input. Orientation changes no longer alter instance identity, current page, or URL.
- Retained odd final-spread handling and repeated-key suppression.
- Replaced destroy-helper test with focused source guards for stable ref, fixed portrait capability, no key, and no manual destroy. Added portrait threshold CSS guard.

TDD evidence:

```text
RED focused test: 39 passed, 1 failed
- expected ref={bookRef}; existing source used ref={setBookRef}

GREEN focused test: 40 passed, 0 failed
Final full suite: 41 passed, 0 failed
```

Verification:

```text
npm test          41 passed, 0 failed
npx tsc --noEmit  exited 0
npm run lint      exited 0
npm run build     exited 0
git diff --check  exited 0
```

Build routes remained:

```text
○ /
ƒ /api/books/[publisherId]/[bookId]
ƒ /read/[publisherId]/[bookId]
```

Other checks:

- Added-line security scan: no hardcoded secrets, shell injection, eval/exec, unsafe pickle, or formatted SQL patterns.
- `react-pageflip` wrapper and `page-flip` 2.0.7 implementation inspected: settings are captured at construction; resize invokes render update and orientation recalculation; portrait activates below `2 * minWidth` (480px).

Concerns:

- `react-pageflip` still lacks unmount cleanup and PageFlip 2.0.7 owns an uncancellable RAF loop. This fix avoids orientation-created duplicate loops but cannot stop the single lifetime loop on route unmount without dependency replacement or patching.
- Browser-level orientation visual test remains absent. Focused guards verify configuration and exact width threshold; library internals and production build verify expected responsive path.
