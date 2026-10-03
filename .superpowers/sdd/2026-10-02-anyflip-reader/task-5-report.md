# Task 5: Real Runtime and Browser Verification

Date: 2026-10-03

## Result

PASS. Production build verified with real Google Chrome through CDP. Assertion gate completed with exit code 0 and `failures: []`.

## Fix

PageFlip root is now constrained to its stage for every viewport:

```css
.flip-book {
  height: 100% !important;
  min-height: 0 !important;
}
```

This replaces the narrow short-landscape-only workaround. PageFlip retains native portrait/spread switching, one lifetime instance, and no transform scaling.

## Static gates

- `npm test`: PASS, 41/41
- `npx tsc --noEmit`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

## Runtime gate

Script: `.superpowers/sdd/2026-10-02-anyflip-reader/task-5-fix-round-2/run-cdp.mjs`

Evidence: `.superpowers/sdd/2026-10-02-anyflip-reader/task-5-fix-round-2/browser-evidence.json`

The script exits nonzero on failed assertions. Final run exited 0.

### Live API

- HTTP 200
- `pageCount`: 324
- first page: `1.webp`
- last page: `324.webp`
- no config/encrypted blob exposed

### Geometry

| Viewport | Mode | Stage/book bottom | Visible pages | Overflow |
|---|---|---:|---:|---|
| 320×568 portrait | portrait | 418 / 418 | 1, contained | none |
| 390×844 portrait | portrait | 694 / 694 | 1, contained | none |
| 480×320 landscape | landscape | 248 / 248 | 2, contained | none |
| 1440×900 desktop | landscape | 828 / 828 | 2, contained | none |

Every viewport passed:

- book contained within all four stage edges
- every visible page contained within all four stage edges
- controls below stage
- no horizontal or vertical document overflow
- identity transform only
- Next button hit-testable

### Interactions

- Valid landing submission navigates to canonical `/read/iehyo/byxp?page=1` and loads `1 of 324`
- Desktop odd bookmark `?page=37` canonicalizes to visible leading page `?page=36`
- Previous updates page and URL
- Jump to page 120 updates status and `?page=120`
- Reload restores page 120
- ArrowRight and ArrowLeft navigate
- Pointer Next changes 36 to 38
- Portrait swipe changes 37 to 38
- Rotation preserves `?page=38` and switches wrapper to landscape
- Lazy loading requested 10 of 324 page images during initial desktop load
- Reduced-motion page turn completed in 114 ms
- Previous disabled at first page
- Next disabled at last page

### States

- loading state exposes `aria-busy=true`
- invalid IDs show safe generic error
- unavailable book shows safe generic error
- invalid host shows inline error and `aria-invalid=true`
- forced page image failure shows retry UI
- Retry remounts image with `?retry=1`

### Accessibility

- page input label: `Page`
- book stage has descriptive `aria-label`
- Tab reaches brand link, Previous, page input, Go, Next, then exits/repeats naturally
- focused controls have visible outlines
- no focus trap

## Artifacts

Fresh screenshots and JSON are under:

`.superpowers/sdd/2026-10-02-anyflip-reader/task-5-fix-round-2/`

## Concerns

- Reader caps books at 500 pages; page elements remain mounted but images use native lazy loading.
- `react-pageflip` retains one dependency-owned RAF loop for reader lifetime. Orientation changes do not accumulate instances; manual teardown is unsafe because dependency removal conflicts with React-owned DOM.
- AnyFlip remains an external upstream dependency.
