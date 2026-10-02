# AnyFlip Reader Design

**Date:** 2026-10-02
**Status:** Approved in chat; awaiting written-spec review

## Goal

Build a Vercel-deployable web reader for public AnyFlip books. Users paste a public AnyFlip URL, read with book-like page-turn animation, and bookmark any reading position because every page change is reflected in the application URL.

## Scope

### Included

- Accept public URLs hosted on `online.anyflip.com`.
- Normalize supported URLs into AnyFlip publisher and book IDs.
- Read public book configuration and page image metadata.
- Render page-turn animation with touch, pointer, and keyboard navigation.
- Show one page in mobile portrait.
- Show two pages on mobile landscape and desktop.
- Keep current page in `?page=N` after every page change.
- Open bookmarked URLs directly at their saved page.
- Provide current-page display and page-jump input.
- Provide clear loading, validation, upstream, and unavailable-book errors.

### Excluded

- Login, accounts, cloud bookmark storage, and database.
- Private books, paywalls, DRM bypass, or access-control bypass.
- Bulk downloading or permanent server-side copies of books.
- Reproducing AnyFlip's complete viewer feature set.

## Technology

- Next.js App Router
- TypeScript
- `react-pageflip` backed by StPageFlip
- Native CSS
- Next.js route handler for controlled AnyFlip metadata fetching
- Node built-in test runner for focused parser tests

No UI framework, database, state library, or proxy cache is needed.

## Routes

### `/`

Landing page with one AnyFlip URL input and submit action. Valid input navigates to the canonical reader URL.

### `/read/[publisherId]/[bookId]?page=N`

Canonical bookmarkable reader route. Example:

```text
/read/iehyo/byxp?page=37
```

`page` uses human-facing numbering starting at 1. Missing or invalid values normalize to page 1. Values beyond the book length clamp to the last page.

### `/api/books/[publisherId]/[bookId]`

Server route that validates IDs, fetches the public AnyFlip `mobile/javascript/config.js`, extracts the `htmlConfig` JSON object without executing JavaScript, and returns only reader-required metadata.

Response shape:

```json
{
  "title": "Kesetiaan Mr. X. by Keigo Higashino",
  "pageCount": 324,
  "pages": [
    "https://online.anyflip.com/iehyo/byxp/files/mobile/1.webp"
  ]
}
```

## URL Input Rules

Supported forms include canonical mobile and non-mobile public book URLs whose host is exactly `online.anyflip.com`, such as:

```text
https://online.anyflip.com/iehyo/byxp/mobile/index.html
https://online.anyflip.com/iehyo/byxp/mobile/
https://online.anyflip.com/iehyo/byxp/
```

The first two path segments after the host become `publisherId` and `bookId`. Both IDs must match `^[A-Za-z0-9_-]+$`. Other hosts, malformed URLs, missing IDs, credentials, or non-HTTPS schemes are rejected.

## Data Flow

1. User submits public AnyFlip URL.
2. Client validates and extracts IDs for immediate feedback.
3. Browser navigates to canonical `/read/...` route.
4. Reader fetches normalized metadata from the local API route.
5. API validates IDs and constructs the upstream URL internally. It never fetches an arbitrary user-provided URL.
6. API parses `var htmlConfig = {...};` using string-boundary checks and `JSON.parse`, never `eval`.
7. API derives absolute page URLs from `fliphtml5_pages` and obtains title from the public mobile HTML metadata.
8. Reader initializes `react-pageflip` at the normalized `page` value.
9. Page-turn events update `?page=N` with `history.replaceState`, preserving a bookmarkable current position without filling browser history for every turn.

## Reader Behavior

- Portrait mobile uses a single-page layout.
- Landscape mobile and wider screens use a two-page spread.
- Layout recalculates on viewport and orientation changes.
- Left/right arrow keys navigate when focus is not inside an editable control.
- Swipe and pointer page turns use StPageFlip behavior.
- Page-jump input accepts only `1..pageCount` and updates reader plus URL.
- Images use browser lazy loading where compatible with the page-flip component.
- Initial rendering prioritizes the current spread; pages are not downloaded in a server-side batch.
- Page images preserve aspect ratio and remain readable within available viewport space.

For two-page spreads, the query parameter records the visible leading human-facing page. If a library event reports its zero-based internal page, the app converts it to human-facing numbering before writing the URL.

## Error Handling

- Invalid pasted URL: inline validation message; no navigation.
- Invalid reader IDs: HTTP 400 from API and reader error state.
- Missing or inaccessible public book: HTTP 404/502 depending on upstream result.
- Unexpected config format: HTTP 502 with generic client-safe message.
- Empty page list: reader reports unavailable content.
- Failed page image: affected page shows a retryable placeholder rather than collapsing the book.

Server logs may include upstream status and parse failure details. Client responses must not expose internal stack traces.

## Security and Abuse Controls

- Exact host allowlist: `online.anyflip.com`.
- Upstream URL assembled from validated IDs, preventing arbitrary SSRF targets.
- HTTPS only.
- Config parsed as JSON text, never evaluated as code.
- Route response contains only title, count, and normalized page URLs.
- Fetch uses a timeout and a maximum accepted config size.
- No cookies or authorization headers forwarded upstream.
- No persistent server-side content storage.

## Accessibility

- URL input has visible label and validation association.
- Buttons have accessible names and disabled states.
- Keyboard navigation is supported.
- Current page status uses an appropriate live region without announcing every animation frame.
- Motion respects `prefers-reduced-motion` where supported by wrapper styling; core page changes remain usable without relying on animation.
- Focus styles remain visible.

## Testing and Verification

### Automated

- Parse supported AnyFlip URL variants.
- Reject unsupported host, scheme, credentials, and malformed IDs.
- Extract `htmlConfig` safely from representative config text.
- Reject malformed, oversized, or missing configuration.
- Normalize and clamp `page` values.
- Run `npm test`.
- Run `npm run lint`.
- Run `npm run build`.

### Browser

Verify against the approved public sample:

```text
https://online.anyflip.com/iehyo/byxp/mobile/index.html
```

Check:

- Landing URL submission.
- Direct `/read/iehyo/byxp?page=37` loading.
- Page-turn URL updates.
- Reload and bookmark restoration.
- Portrait single-page layout.
- Landscape and desktop two-page layout.
- Touch/pointer, keyboard, and jump navigation.
- Loading and invalid-URL states.

## Deployment

The project must run with standard Vercel Next.js deployment and require no secrets. Upstream AnyFlip availability remains an external runtime dependency. Changes to AnyFlip's undocumented config shape can require parser maintenance.
