# AnyFlip Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-ready reader for public AnyFlip books with realistic page turns and bookmarkable page URLs.

**Architecture:** Next.js App Router serves landing and reader routes. Focused pure helpers validate AnyFlip URLs, parse public config without code execution, and normalize page numbers; a controlled route handler fetches only validated AnyFlip resources. Client reader uses `react-pageflip`, synchronizes turns to `?page=N`, and switches between single and double-page layouts based on viewport orientation.

**Tech Stack:** Next.js, React, TypeScript, `react-pageflip`, native CSS, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-10-02-anyflip-reader-design.md`

## Global Constraints

- Accept only HTTPS URLs whose exact hostname is `online.anyflip.com`.
- IDs match `^[A-Za-z0-9_-]+$`; never proxy arbitrary URLs.
- Parse upstream JavaScript as bounded JSON text; never use `eval` or execute it.
- Do not support private books, paywalls, DRM bypass, bulk downloads, or persistent content copies.
- Store current human-facing page in `?page=N` after every page change.
- Mobile portrait shows one page; mobile landscape and desktop show two pages.
- No database, authentication, state library, UI framework, or proxy cache.
- No git action without explicit user permission.

## File Map

- `package.json` — scripts and minimal dependencies.
- `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `next-env.d.ts` — Next.js project configuration.
- `src/app/layout.tsx` — root metadata and shell.
- `src/app/globals.css` — complete responsive/accessibility styling.
- `src/app/page.tsx` — URL submission page.
- `src/components/book-url-form.tsx` — validated URL form.
- `src/lib/anyflip.ts` — URL validation, config parsing, metadata normalization, upstream fetch.
- `src/lib/page.ts` — human-facing page normalization.
- `src/lib/anyflip.test.ts`, `src/lib/page.test.ts` — runnable unit checks.
- `src/app/api/books/[publisherId]/[bookId]/route.ts` — controlled metadata API.
- `src/app/read/[publisherId]/[bookId]/page.tsx` — route boundary and dynamic reader load.
- `src/components/book-reader.tsx` — fetch state, page flip, controls, URL sync, keyboard support.
- `src/components/book-page.tsx` — individual image and retryable failure state.

---

### Task 1: Project Foundation and URL/Page Rules

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `next-env.d.ts`
- Create: `src/lib/anyflip.test.ts`
- Create: `src/lib/page.test.ts`
- Create: `src/lib/anyflip.ts`
- Create: `src/lib/page.ts`

**Interfaces:**
- Produces: `parseAnyFlipUrl(input: string): BookIdentity`
- Produces: `isValidBookId(value: string): boolean`
- Produces: `normalizePage(value: string | null | undefined, pageCount: number): number`
- Produces: `BookIdentity = { publisherId: string; bookId: string }`

- [ ] **Step 1: Create project manifest and compiler/linter config**

Use scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "node --import tsx --test src/**/*.test.ts"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-pageflip": "^2.0.3"
  },
  "devDependencies": {
    "@eslint/eslintrc": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "eslint": "latest",
    "eslint-config-next": "latest",
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

Use strict TypeScript, `@/*` mapped to `src/*`, Next.js ESLint flat config, and default Next type declarations.

- [ ] **Step 2: Write failing URL and page tests**

Cover these exact cases:

```ts
assert.deepEqual(
  parseAnyFlipUrl("https://online.anyflip.com/iehyo/byxp/mobile/index.html"),
  { publisherId: "iehyo", bookId: "byxp" },
);
assert.deepEqual(
  parseAnyFlipUrl("https://online.anyflip.com/iehyo/byxp/"),
  { publisherId: "iehyo", bookId: "byxp" },
);
assert.throws(() => parseAnyFlipUrl("http://online.anyflip.com/iehyo/byxp/"));
assert.throws(() => parseAnyFlipUrl("https://evil.example/iehyo/byxp/"));
assert.throws(() => parseAnyFlipUrl("https://user@online.anyflip.com/iehyo/byxp/"));
assert.throws(() => parseAnyFlipUrl("https://online.anyflip.com/iehyo/"));
assert.equal(normalizePage("37", 324), 37);
assert.equal(normalizePage("0", 324), 1);
assert.equal(normalizePage("999", 324), 324);
assert.equal(normalizePage("wat", 324), 1);
```

- [ ] **Step 3: Run tests and confirm RED**

Run: `npm install && npm test`

Expected: tests fail because helper modules or exports do not exist.

- [ ] **Step 4: Implement minimal URL and page helpers**

`parseAnyFlipUrl` must use native `URL`, reject non-HTTPS, credentials, wrong host, missing segments, and invalid IDs. `normalizePage` must parse a base-10 integer and clamp it to `1..pageCount`.

- [ ] **Step 5: Run focused checks and confirm GREEN**

Run: `npm test`

Expected: all Task 1 tests pass.

### Task 2: Safe AnyFlip Metadata Parser and Fetcher

**Files:**
- Modify: `src/lib/anyflip.test.ts`
- Modify: `src/lib/anyflip.ts`
- Create: `src/app/api/books/[publisherId]/[bookId]/route.ts`

**Interfaces:**
- Consumes: `isValidBookId(value: string): boolean`
- Produces: `BookMetadata = { title: string; pageCount: number; pages: string[] }`
- Produces: `parseAnyFlipConfig(source: string, identity: BookIdentity): BookMetadata`
- Produces: `fetchAnyFlipBook(identity: BookIdentity, signal?: AbortSignal): Promise<BookMetadata>`

- [ ] **Step 1: Add failing parser tests**

Use representative config:

```ts
const source = `var htmlConfig = {"fliphtml5_pages":[
  {"n":["../files/mobile/1.webp"],"t":"../files/thumb/1.webp"},
  {"n":["../files/mobile/2.webp"],"t":"../files/thumb/2.webp"}
],"meta":{"title":"Sample Book"}};`;

assert.deepEqual(parseAnyFlipConfig(source, { publisherId: "abc", bookId: "xyz" }), {
  title: "Sample Book",
  pageCount: 2,
  pages: [
    "https://online.anyflip.com/abc/xyz/files/mobile/1.webp",
    "https://online.anyflip.com/abc/xyz/files/mobile/2.webp",
  ],
});
assert.throws(() => parseAnyFlipConfig("alert(1)", identity));
assert.throws(() => parseAnyFlipConfig("var htmlConfig = {};", identity));
assert.throws(() => parseAnyFlipConfig("x".repeat(MAX_CONFIG_BYTES + 1), identity));
```

Also verify external page URLs and non-WebP paths are rejected.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test`

Expected: parser symbols are missing.

- [ ] **Step 3: Implement bounded JSON extraction**

Define `MAX_CONFIG_BYTES = 2_000_000`. Require prefix `var htmlConfig = ` and terminal semicolon, slice only JSON payload, call `JSON.parse`, validate `fliphtml5_pages` as a non-empty array, and normalize only relative `../files/mobile/<number>.webp` paths to the validated book base URL. Title fallback: `AnyFlip Book`.

- [ ] **Step 4: Implement upstream fetch with timeout**

Fetch only:

```ts
https://online.anyflip.com/${publisherId}/${bookId}/mobile/javascript/config.js
```

Use `AbortSignal.timeout(10_000)`, `cache: "no-store"`, and no forwarded request headers. Map upstream 404/403 to a not-found error and other failures to an upstream error.

- [ ] **Step 5: Implement route handler**

Validate both route params, call `fetchAnyFlipBook`, return normalized JSON. Return client-safe JSON errors with 400, 404, or 502. Log server-side failure detail without stack traces in response.

- [ ] **Step 6: Run tests and lint**

Run: `npm test && npm run lint`

Expected: all tests pass and ESLint exits 0.

### Task 3: Landing Page and Canonical Navigation

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/book-url-form.tsx`

**Interfaces:**
- Consumes: `parseAnyFlipUrl(input: string): BookIdentity`
- Produces: client navigation to `/read/${publisherId}/${bookId}?page=1`

- [ ] **Step 1: Build semantic app shell and landing copy**

Root metadata title: `Pagekeeper — AnyFlip Reader`. Landing page contains heading, concise explanation, URL form, and notice that only public AnyFlip books are supported.

- [ ] **Step 2: Build validated URL form**

Use controlled input, visible `<label>`, `aria-describedby`, inline error with `role="alert"`, submit button, and `router.push` only after `parseAnyFlipUrl` succeeds. Example placeholder uses approved sample URL.

- [ ] **Step 3: Add responsive native CSS**

Create dark neutral reading UI, visible focus rings, minimum 44px interactive targets, responsive form, and `prefers-reduced-motion` overrides. Avoid UI framework and decorative animation.

- [ ] **Step 4: Verify lint and production compile checkpoint**

Run: `npm run lint && npm run build`

Expected: both exit 0; `/` compiles.

### Task 4: Flipbook Reader and Bookmark URL Sync

**Files:**
- Create: `src/app/read/[publisherId]/[bookId]/page.tsx`
- Create: `src/components/book-reader.tsx`
- Create: `src/components/book-page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `BookMetadata` from `/api/books/[publisherId]/[bookId]`
- Consumes: `normalizePage(value, pageCount): number`
- Produces: URL synchronization via `window.history.replaceState`

- [ ] **Step 1: Create route boundary with client-only page-flip load**

Pass route IDs and initial `searchParams.page` to `BookReader`. Dynamically load flipbook code client-side because StPageFlip depends on browser layout APIs.

- [ ] **Step 2: Implement metadata loading states**

`BookReader` fetches local API, renders a labeled loading state, handles non-OK JSON errors, rejects empty pages, and exposes retry without losing route state.

- [ ] **Step 3: Implement page component with image retry**

Forward the DOM ref required by `react-pageflip`. Render page image with `draggable={false}`, page number, loading styling, and an error placeholder containing a retry button that changes a local image key.

- [ ] **Step 4: Implement responsive page-flip instance**

Configure `HTMLFlipBook` with fixed proportional page dimensions, `size="stretch"`, shadows, touch scrolling, portrait support, and `showCover`. Determine `usePortrait` from `matchMedia("(orientation: portrait) and (max-width: 767px)")`; rebuild on media-query changes so portrait is one page and landscape/desktop is a spread.

- [ ] **Step 5: Synchronize current page to URL**

On `onFlip`, convert zero-based index to human page, update visible status, then run:

```ts
const url = new URL(window.location.href);
url.searchParams.set("page", String(humanPage));
window.history.replaceState(null, "", url);
```

Normalize initial query after metadata loads, initialize the book at `normalizedPage - 1`, and replace invalid/clamped query values with their canonical value.

- [ ] **Step 6: Add controls and keyboard navigation**

Provide previous/next buttons, numeric jump input constrained to `1..pageCount`, current-page live region, and link back to landing. Ignore arrow-key shortcuts when target is `input`, `textarea`, `select`, or contenteditable.

- [ ] **Step 7: Style reader across target viewports**

Fit book inside remaining viewport, preserve page aspect ratio, keep controls reachable, support safe-area padding, display image failures without collapsing dimensions, and reduce nonessential transitions for reduced motion.

- [ ] **Step 8: Run complete static verification**

Run: `npm test && npm run lint && npm run build`

Expected: tests pass, lint exits 0, production build includes `/`, `/read/[publisherId]/[bookId]`, and `/api/books/[publisherId]/[bookId]`.

### Task 5: Real Runtime and Browser Verification

**Files:**
- Modify only files implicated by real failures.

**Interfaces:**
- Consumes approved sample: `https://online.anyflip.com/iehyo/byxp/mobile/index.html`
- Verifies canonical reader: `/read/iehyo/byxp?page=37`

- [ ] **Step 1: Start production server**

Run: `npm run build && npm start`

Expected: server becomes reachable locally without environment variables.

- [ ] **Step 2: Verify API against live AnyFlip data**

Request `/api/books/iehyo/byxp`. Assert HTTP 200, `pageCount === 324`, first/last page URLs end in `/1.webp` and `/324.webp`, and response contains no encrypted config blob.

- [ ] **Step 3: Verify desktop reader**

At desktop viewport, submit sample URL, confirm navigation to canonical reader, direct page 37 opens, next/previous and jump controls update `?page=`, reload restores the page, arrow keys work, and spread shows two pages.

- [ ] **Step 4: Verify mobile portrait and landscape**

At portrait mobile viewport confirm one visible page and swipe-capable layout. Rotate/emulate landscape and confirm two-page spread while current query stays valid.

- [ ] **Step 5: Verify failures and accessibility basics**

Submit wrong host and confirm inline error. Open invalid IDs and unavailable book and confirm safe error UI. Tab through controls and confirm visible focus, labels, disabled states, and no focus trap.

- [ ] **Step 6: Fix only observed failures, then rerun full gates**

Run after fixes:

```bash
npm test && npm run lint && npm run build
```

Expected: all commands exit 0. Recheck any browser path affected by fixes.

- [ ] **Step 7: Report exact evidence**

Report test count, lint status, build routes, live API result, browser viewport results, and any upstream limitations. Do not commit, push, or deploy without separate explicit permission.
