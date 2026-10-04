# Supabase Auth, Library, and Reading Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public Supabase email/password auth, a private AnyFlip library, persisted reading progress, and Continue Reading without regressing the existing public reader.

**Architecture:** Next.js App Router uses cookie-backed `@supabase/ssr` clients. Server actions own auth and library mutations, the existing trusted AnyFlip adapter supplies metadata, PostgreSQL RLS is the authorization boundary, and a focused client hook saves only the latest visible page for books already present in the user's library.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `@supabase/ssr`, `@supabase/supabase-js`, Supabase Auth/PostgreSQL/RLS, native CSS, Node built-in test runner

**Spec:** `docs/superpowers/specs/2026-10-04-supabase-auth-library-design.md`

## Global Constraints

- Public email/password registration; Confirm email disabled in Supabase Dashboard.
- Public reader remains usable without login.
- `/library` requires an authenticated user.
- Never use Prisma, `DATABASE_URL`, `DIRECT_URL`, PostgreSQL password, or `SUPABASE_SERVICE_ROLE_KEY`.
- Browser-supplied title, page count, and user ID are never trusted.
- RLS must restrict every operation to `auth.uid() = user_id`.
- Progress writes occur only when the book already exists in the signed-in user's library.
- Existing gestures, keyboard navigation, zoom, page-turn animation, and public URL flow must remain unchanged.
- No arbitrary upstream URL fetch; reuse `parseAnyFlipUrl` and `fetchAnyFlipBook`.
- `.env.local` remains ignored; only `.env.example` is committed.
- No Git commit, push, merge, reset, or destructive operation without explicit user permission.
- Keep `IMPLEMENTATION_TRACKING.md` current after every completed local change.

## File Map

### Create

- `.env.example` — public Supabase variable names only.
- `IMPLEMENTATION_TRACKING.md` — active checklist and verification evidence.
- `supabase/migrations/202610040001_create_library_books.sql` — table, indexes, grants, and ownership RLS policies.
- `src/lib/supabase/config.ts` — validated public environment access.
- `src/lib/supabase/client.ts` — browser Supabase client.
- `src/lib/supabase/server.ts` — cookie-backed server Supabase client.
- `src/lib/auth.ts` — safe internal redirect normalization and auth-facing error mapping.
- `src/lib/auth.test.ts` — auth helper tests.
- `src/lib/library.ts` — library row types, progress math/clamp, database error mapping.
- `src/lib/library.test.ts` — library helper and migration contract tests.
- `src/app/auth/actions.ts` — login/register/logout server actions.
- `src/components/auth-form.tsx` — shared accessible auth form.
- `src/app/login/page.tsx` — login page.
- `src/app/register/page.tsx` — registration page.
- `src/app/library/actions.ts` — authenticated add/delete actions.
- `src/components/library-add-book-form.tsx` — add-book client form.
- `src/components/library-book-item.tsx` — one real library row and confirmed delete action.
- `src/app/library/page.tsx` — protected library page.
- `src/lib/use-reading-progress.ts` — matching-row lookup and debounced progress persistence.
- `src/lib/use-reading-progress.test.ts` — source contract for debounce integration where browser timing cannot be exercised by Node tests.
- `src/proxy.ts` — Supabase session refresh and protected route redirect.

### Modify

- `package.json`, `package-lock.json` — Supabase dependencies.
- `src/app/page.tsx` — compact real Login/Register/Library navigation.
- `src/components/book-reader.tsx` — call isolated progress hook with visible page and page count.
- `src/app/globals.css` — auth/library responsive states without sidebar or generic dashboard chrome.

---

### Task 1: Dependencies, Environment Contract, Tracking, and RLS Migration

**Files:**
- Create: `.env.example`
- Create: `IMPLEMENTATION_TRACKING.md`
- Create: `supabase/migrations/202610040001_create_library_books.sql`
- Create: `src/lib/library.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces table `public.library_books` with columns `id`, `user_id`, `publisher_id`, `book_id`, `title`, `page_count`, `last_page`, `last_read_at`, `created_at`.
- Produces unique key `(user_id, publisher_id, book_id)`.
- Produces four policies named `library_books_select_own`, `library_books_insert_own`, `library_books_update_own`, and `library_books_delete_own`.

- [ ] **Step 1: Install only required Supabase packages**

Run:

```bash
npm install @supabase/ssr @supabase/supabase-js
```

Expected: `package.json` gains both runtime dependencies and lockfile resolves successfully.

- [ ] **Step 2: Write the migration contract test first**

Add to `src/lib/library.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/202610040001_create_library_books.sql", import.meta.url),
  "utf8",
);

test("library migration enforces ownership and one copy per user", () => {
  assert.match(migration, /alter table public\.library_books enable row level security/i);
  assert.match(migration, /unique \(user_id, publisher_id, book_id\)/i);
  assert.match(migration, /for select[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(migration, /for insert[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(migration, /for update[\s\S]*using \(auth\.uid\(\) = user_id\)[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(migration, /for delete[\s\S]*auth\.uid\(\) = user_id/i);
});
```

- [ ] **Step 3: Run focused test and verify RED**

Run:

```bash
npm test -- --test-name-pattern="library migration"
```

Expected: FAIL because migration file does not exist.

- [ ] **Step 4: Add environment example and exact migration**

`.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Migration:

```sql
create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publisher_id text not null,
  book_id text not null,
  title text not null,
  page_count integer not null check (page_count > 0 and page_count <= 500),
  last_page integer not null default 1,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint library_books_last_page_check
    check (last_page >= 1 and last_page <= page_count),
  constraint library_books_owner_book_unique
    unique (user_id, publisher_id, book_id)
);

create index library_books_user_last_read_idx
  on public.library_books (user_id, last_read_at desc nulls last, created_at desc);

alter table public.library_books enable row level security;

grant select, insert, update, delete on public.library_books to authenticated;

create policy library_books_select_own
on public.library_books for select to authenticated
using (auth.uid() = user_id);

create policy library_books_insert_own
on public.library_books for insert to authenticated
with check (auth.uid() = user_id);

create policy library_books_update_own
on public.library_books for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy library_books_delete_own
on public.library_books for delete to authenticated
using (auth.uid() = user_id);
```

- [ ] **Step 5: Create active tracking file**

Initialize `IMPLEMENTATION_TRACKING.md` with all eight task names, current branch, changed files, and a verification table. Mark only completed work as complete; append exact command results after every gate.

- [ ] **Step 6: Run focused test and verify GREEN**

Run:

```bash
npm test -- --test-name-pattern="library migration"
```

Expected: PASS.

- [ ] **Step 7: Apply migration to Supabase**

Preferred command when a linked Supabase CLI session and rotated DB credential are available:

```bash
npx supabase db push
```

Otherwise paste the exact migration file into Supabase SQL Editor and run it once. Do not use the database password previously exposed in chat. Verify through SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'library_books';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'library_books'
order by policyname;
```

Expected: `rowsecurity = true`, four ownership policies.

- [ ] **Step 8: Record Task 1 in tracking**

Record migration application status separately as `applied` or `blocked: requires Supabase dashboard access`. Do not claim cloud migration success from local file creation.

### Task 2: Supabase Clients and Safe Redirect Rules

**Files:**
- Create: `src/lib/supabase/config.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth.test.ts`
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Produces `getSupabaseConfig(): { url: string; publishableKey: string }`.
- Produces `createBrowserClient(): SupabaseClient`.
- Produces `createServerClient(): Promise<SupabaseClient>`.
- Produces `safeNextPath(value: string | null | undefined): string`.
- Produces `authErrorMessage(mode: "login" | "register"): string`.

- [ ] **Step 1: Write failing redirect and config tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage, safeNextPath } from "./auth";

test("safeNextPath accepts only internal application paths", () => {
  assert.equal(safeNextPath("/library"), "/library");
  assert.equal(safeNextPath("/read/a/b?page=4"), "/read/a/b?page=4");
  assert.equal(safeNextPath("https://evil.example"), "/library");
  assert.equal(safeNextPath("//evil.example"), "/library");
  assert.equal(safeNextPath("javascript:alert(1)"), "/library");
});

test("auth errors stay generic", () => {
  assert.equal(authErrorMessage("login"), "Invalid email or password.");
  assert.equal(authErrorMessage("register"), "Unable to create account.");
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- --test-name-pattern="safeNextPath|auth errors"`

Expected: FAIL because `src/lib/auth.ts` does not exist.

- [ ] **Step 3: Implement minimal helpers**

Use native `URL` with a fixed base and require `url.origin === "https://pagekeeper.local"`, `value.startsWith("/")`, and `!value.startsWith("//")`; fallback to `/library`.

`getSupabaseConfig` reads exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, throws `Supabase environment is not configured` if missing, and never includes values in error text.

Browser client wraps Supabase's `createBrowserClient`; server client uses `cookies()` and implements `getAll`/`setAll`, swallowing cookie writes only when called from a Server Component where Next.js disallows mutation.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm test -- --test-name-pattern="safeNextPath|auth errors"
npm test
```

Expected: all pass.

- [ ] **Step 5: Update tracking**

Record created files and test output.

### Task 3: Auth Server Actions, Forms, and Session Refresh Proxy

**Files:**
- Create: `src/app/auth/actions.ts`
- Create: `src/components/auth-form.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/proxy.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/auth.test.ts`
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Produces `AuthState = { error: string }`.
- Produces `login(previousState: AuthState, formData: FormData): Promise<AuthState>`.
- Produces `register(previousState: AuthState, formData: FormData): Promise<AuthState>`.
- Produces `logout(): Promise<never>`.
- Produces `AuthForm({ mode, nextPath })`.

- [ ] **Step 1: Add failing source-contract tests**

Read auth action and proxy sources and assert:

```ts
assert.match(actions, /auth\.getUser\(\)/);
assert.match(actions, /auth\.signInWithPassword/);
assert.match(actions, /auth\.signUp/);
assert.match(actions, /auth\.signOut/);
assert.match(proxy, /request\.nextUrl\.pathname === "\/library"/);
assert.match(proxy, /redirect\(loginUrl\)/);
assert.doesNotMatch(actions, /service.role|SERVICE_ROLE/);
```

- [ ] **Step 2: Run source-contract test and verify RED**

Expected: FAIL because action/proxy files do not exist.

- [ ] **Step 3: Implement auth actions**

Validate `email` as trimmed non-empty text containing `@`, password as non-empty, and next path through `safeNextPath`. Call Supabase auth APIs. On success, `redirect(nextPath)` for login/register and `redirect("/")` for logout. Return only generic errors.

- [ ] **Step 4: Implement shared auth UI**

Use `useActionState`. Fields: email, password, hidden `next`. Disable submit while pending, preserve semantic labels, `aria-live="polite"`, links between login and register. Do not display fake accounts or provider buttons.

- [ ] **Step 5: Implement proxy and route behavior**

Use current Next.js `proxy(request: NextRequest)` convention. Refresh session cookies with a request-bound Supabase server client. Redirect unauthenticated exact `/library` requests to `/login?next=/library`. Redirect authenticated `/login` and `/register` requests to `/library`. Export matcher excluding static assets and image optimization.

- [ ] **Step 6: Add real navigation to landing**

Server-render compact links for `Login`, `Register`, or `Library` based on `auth.getUser()`. Every visible link must have a working destination.

- [ ] **Step 7: Run tests, ESLint, TypeScript, and build**

```bash
npm test
npx eslint src/app/auth/actions.ts src/components/auth-form.tsx src/app/login/page.tsx src/app/register/page.tsx src/proxy.ts src/app/page.tsx src/lib/auth.ts src/lib/auth.test.ts
npx tsc --noEmit
rm -f tsconfig.tsbuildinfo
npm run build
```

Expected: all exit 0; routes `/login`, `/register`, and `/library` compile.

- [ ] **Step 8: Verify auth runtime against Supabase**

Before test, ensure Dashboard setting `Authentication → Providers → Email → Confirm email` is disabled. Register a unique email, confirm immediate redirect to `/library`, logout, login again, and verify wrong password shows only `Invalid email or password.`

- [ ] **Step 9: Update tracking**

Record runtime account used without storing password or token.

### Task 4: Library Domain Helpers and Authenticated Add/Delete Actions

**Files:**
- Modify: `src/lib/library.ts`
- Modify: `src/lib/library.test.ts`
- Create: `src/app/library/actions.ts`
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Produces `LibraryBook` row type.
- Produces `libraryProgress(lastPage: number, pageCount: number): number`.
- Produces `clampProgressPage(page: number, pageCount: number): number`.
- Produces `libraryMutationError(code?: string): string`.
- Produces `LibraryActionState = { error: string; success: string }`.
- Produces `addBook(previousState, formData): Promise<LibraryActionState>`.
- Produces `deleteBook(formData): Promise<void>`.

- [ ] **Step 1: Write failing pure-helper tests**

```ts
assert.equal(libraryProgress(1, 377), 0);
assert.equal(libraryProgress(189, 377), 50);
assert.equal(libraryProgress(377, 377), 100);
assert.equal(clampProgressPage(0, 377), 1);
assert.equal(clampProgressPage(999, 377), 377);
assert.equal(libraryMutationError("23505"), "Book already exists in your library.");
assert.equal(libraryMutationError("other"), "Unable to update your library.");
```

- [ ] **Step 2: Run focused tests and verify RED**

Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Implement pure helpers**

Use `Math.round(((lastPage - 1) / Math.max(1, pageCount - 1)) * 100)` so page 1 is 0% and final page is 100%. Clamp non-finite page values to 1.

- [ ] **Step 4: Add failing action source-contract test**

Assert action source contains `auth.getUser()`, `parseAnyFlipUrl`, `fetchAnyFlipBook`, server-derived `user.id`, exact insert columns, ownership-qualified delete, `revalidatePath("/library")`, and no service-role key.

- [ ] **Step 5: Run contract test and verify RED**

Expected: FAIL because `src/app/library/actions.ts` does not exist.

- [ ] **Step 6: Implement `addBook`**

Sequence must be: authenticate; read `url`; parse validated identity; fetch trusted metadata; insert `user_id`, IDs, trusted title/page count, `last_page: 1`; map `23505`; revalidate on success. AnyFlip not-found and upstream errors map to readable field-level messages without raw upstream details.

- [ ] **Step 7: Implement `deleteBook`**

Authenticate again, validate UUID string conservatively, delete with both `.eq("id", id)` and `.eq("user_id", user.id)`, throw a generic action error on database failure, and revalidate `/library`.

- [ ] **Step 8: Run focused then full tests**

```bash
npm test -- --test-name-pattern="library progress|library mutation|library actions"
npm test
```

Expected: all pass.

- [ ] **Step 9: Update tracking**

Record helpers, actions, and results.

### Task 5: Protected Library UI

**Files:**
- Create: `src/components/library-add-book-form.tsx`
- Create: `src/components/library-book-item.tsx`
- Create: `src/app/library/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/library.test.ts`
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Consumes `addBook`, `deleteBook`, `LibraryBook`, and `libraryProgress`.
- Produces a server-rendered private library ordered by `last_read_at desc nulls last, created_at desc`.

- [ ] **Step 1: Add failing UI source-contract tests**

Assert:

```ts
assert.match(page, /auth\.getUser\(\)/);
assert.match(page, /redirect\("\/login\?next=\/library"\)/);
assert.match(page, /order\("last_read_at", \{ ascending: false, nullsFirst: false \}\)/);
assert.match(item, /Continue reading/);
assert.match(item, /\?page=\$\{book\.last_page\}/);
assert.match(item, /confirm\(/);
assert.match(form, /useActionState/);
```

- [ ] **Step 2: Run contract test and verify RED**

Expected: FAIL because library UI files do not exist.

- [ ] **Step 3: Implement protected server page**

Call `auth.getUser()`, redirect if absent, query only named columns, order latest activity first, distinguish database error from empty state, and pass real rows to item components. Empty state copy: `No books saved yet. Add a public AnyFlip URL to start your library.`

- [ ] **Step 4: Implement add form**

Use `useActionState(addBook, { error: "", success: "" })`; URL input has exact AnyFlip guidance, pending disables button, success resets input through a form ref, and errors render with `role="alert"`.

- [ ] **Step 5: Implement book item**

Render title, `Page X of Y`, derived percentage, Continue Reading link, and Delete button. Confirm deletion with `window.confirm("Remove this book from your library?")`. No cover image is invented because metadata currently exposes no validated cover field.

- [ ] **Step 6: Add focused responsive CSS**

No sidebar, stat cards, fake activity, or decoration-only icon. Use existing Pagekeeper typography/colors. Desktop rows may use two columns; mobile stacks controls with minimum 44 px touch targets. Add distinct loading/error/empty classes.

- [ ] **Step 7: Run test and static gates**

```bash
npm test
npx eslint src/app/library src/components/library-add-book-form.tsx src/components/library-book-item.tsx src/lib/library.ts src/lib/library.test.ts
npx tsc --noEmit
rm -f tsconfig.tsbuildinfo
npm run build
```

Expected: all exit 0.

- [ ] **Step 8: Runtime verify library**

Authenticated user adds `https://online.anyflip.com/rkmsb/khqo/`; row uses upstream title/page count. Second add returns duplicate message. Delete confirmation cancel preserves row; confirm removes row.

- [ ] **Step 9: Update tracking**

Record desktop/mobile runtime state and exact row behavior.

### Task 6: Debounced Reading Progress Integration

**Files:**
- Create: `src/lib/use-reading-progress.ts`
- Create: `src/lib/use-reading-progress.test.ts`
- Modify: `src/components/book-reader.tsx`
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Produces `useReadingProgress({ publisherId, bookId, page, pageCount }): { saveError: string }`.
- Consumes existing visible human-facing `currentPage` and trusted `metadata.pageCount`.

- [ ] **Step 1: Write failing progress-integration contract test**

Assert hook source contains:

```ts
assert.match(source, /const SAVE_DELAY = 750/);
assert.match(source, /\.eq\("publisher_id", publisherId\)/);
assert.match(source, /\.eq\("book_id", bookId\)/);
assert.match(source, /last_page: clampProgressPage\(page, pageCount\)/);
assert.match(source, /last_read_at: new Date\(\)\.toISOString\(\)/);
assert.match(source, /document\.addEventListener\("visibilitychange"/);
assert.match(reader, /useReadingProgress\(/);
```

- [ ] **Step 2: Run focused test and verify RED**

Expected: FAIL because hook file and reader integration do not exist.

- [ ] **Step 3: Implement hook lookup**

Create one browser client via `useMemo`. On identity change, call `auth.getUser()`. If no user, mark unsaved and stop. Query matching row ID and stored page using exact publisher/book IDs; RLS scopes owner. Never insert a missing row.

- [ ] **Step 4: Implement latest-page debounce**

Keep pending page and timer refs. When `page`, `pageCount`, or saved row ID changes, clear prior timer and schedule one update after 750 ms. Update row by ID with clamped `last_page` and ISO `last_read_at`. Ignore stale promise completions after identity change. Set a short non-blocking error only on failed update; clear it on next successful write.

- [ ] **Step 5: Flush on hidden and cleanup**

On `visibilitychange` to hidden, clear timer and start the same update immediately. Cleanup listener and timer on unmount. Do not call async work from `beforeunload` and do not add `sendBeacon` because Supabase auth headers/cookies make it unreliable here.

- [ ] **Step 6: Integrate without touching navigation logic**

Call hook once after metadata/current page exist. Render `saveError` in reader chrome using `role="status"`; do not block flips, URL updates, zoom, or gestures.

- [ ] **Step 7: Run tests and static gates**

```bash
npm test
npx eslint src/lib/use-reading-progress.ts src/lib/use-reading-progress.test.ts src/components/book-reader.tsx
npx tsc --noEmit
rm -f tsconfig.tsbuildinfo
npm run build
```

Expected: all exit 0 and existing reader regression tests remain green.

- [ ] **Step 8: Runtime verify persistence**

Add sample book, open at page 1, navigate to page 10, wait at least 1 second, return to library, and confirm `last_page = 10`. Use Continue Reading and confirm URL opens `?page=10`. Navigate rapidly through several pages and verify only final page persists after debounce.

- [ ] **Step 9: Update tracking**

Record exact page sequence and persisted result.

### Task 7: Isolation, Auth Boundaries, and Full Runtime Verification

**Files:**
- Modify tests only if an actual uncovered defect is found first through a failing regression.
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Verifies delivered behavior; produces no new product API.

- [ ] **Step 1: Create two disposable public-registration users**

Use unique emails and strong temporary passwords. Do not write credentials into repository files, logs, screenshots, or tracking.

- [ ] **Step 2: Verify user A ownership**

As user A, add sample book and navigate to a non-default page. Query through the browser session and confirm one owned row.

- [ ] **Step 3: Verify user B isolation**

As user B, confirm library starts empty. Attempt direct browser-client select/update/delete using user A's known row ID. Expected: select returns no row; update/delete affects zero rows; user A row remains unchanged.

- [ ] **Step 4: Verify route/session behavior**

Logout and request `/library`; expected redirect to `/login?next=/library`. Public `/read/rkmsb/khqo?page=10` remains accessible and navigation works without a session. Login with `next=/library` returns only to internal path.

- [ ] **Step 5: Re-run known reader regressions in real Chrome**

Verify:

- Next/Previous animated page turn.
- Right then Left before animation completes does not lock navigation.
- Rapid same-direction input does not skip requested pages.
- Arrow Up/Down adjusts zoom by 2%.
- Mobile swipe and footer controls remain functional.
- Signed-out reader does not attempt progress insert.

- [ ] **Step 6: Run complete quality gate**

```bash
npm test
npx eslint .
npx tsc --noEmit
rm -f tsconfig.tsbuildinfo
npm run build
git diff --check
git status --short
```

Expected: tests all pass; lint, TypeScript, build, and diff check exit 0; status lists only intentional files.

- [ ] **Step 7: Update tracking with exact evidence**

Record test count, lint/type/build exits, runtime page results, RLS isolation result, blockers, and remaining deployment action.

### Task 8: Antislop Audit, Production Configuration, and Delivery

**Files:**
- Modify UI/CSS only for numbered audit findings that fail requirements.
- Modify: `IMPLEMENTATION_TRACKING.md`

**Interfaces:**
- Final delivery gate; no new product interface.

- [ ] **Step 1: Run numbered antislop audit after render**

Check and record each:

1. No default dashboard sidebar/stat-card/chart layout.
2. No fake covers, users, metrics, or activity.
3. Add-book action is dominant; account actions stay secondary.
4. Empty/loading/error states name cause and next action.
5. Every control works by keyboard and has visible focus.
6. Touch targets are at least 44 px on mobile.
7. No decorative gradients, glow, generic AI icons, or needless pills.
8. Reader chrome geometry remains unchanged except intentional save status.

Fix every relevant failure immediately, then rerun Task 7 Step 6.

- [ ] **Step 2: Configure Vercel environment**

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Preview and Production through Vercel settings. Never paste values into Git. Trigger deployment only after user grants Git push permission.

- [ ] **Step 3: Production smoke test**

Verify production registration, login, add, duplicate handling, progress persistence, Continue Reading, delete, logout protection, and public reader. Confirm production `/api/books/rkmsb/khqo` returns HTTP 200.

- [ ] **Step 4: Final tracking state**

Mark tasks complete, list any user-only Supabase/Vercel settings, and keep active tracking file as exact final evidence. Do not mark migration/deployment complete without live verification.

- [ ] **Step 5: Request Git permission if not already granted**

Present exact changed files and checks. Only after explicit approval:

```bash
git add .env.example IMPLEMENTATION_TRACKING.md package.json package-lock.json supabase src docs/superpowers/specs/2026-10-04-supabase-auth-library-design.md docs/superpowers/plans/2026-10-04-supabase-auth-library.md
git commit -m "feat: add authenticated reading library"
git push origin main
```

Because work occurs directly on `main`, no separate merge exists. Verify `HEAD == origin/main` and clean working tree after push.
