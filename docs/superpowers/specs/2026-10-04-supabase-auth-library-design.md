# Supabase Auth, Library, and Reading Progress Design

Date: 2026-10-04
Status: Draft for user review

## 1. Goal

Add public email/password registration, login, a private per-user AnyFlip library, automatic reading-progress persistence, and Continue Reading to Pagekeeper without changing the existing public-reader behavior.

## 2. Scope

### In scope

- Public registration with email and password.
- Login, logout, and persisted Supabase session.
- No email-confirmation requirement.
- Protected `/library` page.
- Add a public `online.anyflip.com` book URL to the signed-in user's library.
- Server-side AnyFlip URL validation and metadata lookup before insert.
- Private per-user library enforced by PostgreSQL Row Level Security (RLS).
- Duplicate protection per user using `publisher_id + book_id`.
- Automatic save of last visible page while reading.
- Continue Reading from the stored page.
- Delete a book from the user's library.
- Responsive loading, empty, success, and error states.

### Out of scope

- Social login.
- Password-reset flow.
- Email confirmation.
- Admin roles or user management.
- Shared/public libraries.
- Favorites, tags, folders, ratings, or reading history.
- Offline downloads or copied AnyFlip assets.
- Prisma and direct PostgreSQL credentials.
- Service-role operations.

## 3. Product behavior

### Public visitor

- Can open the landing page.
- Can paste a public AnyFlip URL and read it using the current reader.
- Can open `/login` and `/register`.
- Cannot access `/library`; redirected to `/login?next=/library`.
- Reading progress is not saved.

### Signed-in user

- Can open `/library`.
- Can add a public AnyFlip URL.
- Sees title, page count, last page, progress percentage, and last-read state for each saved book.
- Can open a saved book from its stored page.
- Can delete a saved book.
- Reader saves progress only when the currently opened book already belongs to the user's library.
- Opening an arbitrary public book does not silently add it to the library.

### Registration

- Email and password are required.
- Password uses Supabase Auth policy and server response; UI does not invent a weaker local policy.
- Successful registration creates a session immediately because Confirm email is disabled in Supabase.
- User is redirected to `/library`.
- Existing email and invalid credentials use a generic, readable error without exposing internal Supabase details.

## 4. Architecture

Use `@supabase/ssr` and `@supabase/supabase-js`.

```text
Browser
  ├─ Supabase browser client
  │    ├─ register/login/logout
  │    └─ authenticated library CRUD under RLS
  ├─ /library
  └─ /read/:publisherId/:bookId
         └─ debounced progress update under RLS

Next.js server
  ├─ Supabase server client (cookie-backed session)
  ├─ auth session refresh proxy
  ├─ protected library route
  └─ add-book server action
         ├─ validates current user
         ├─ parses exact AnyFlip URL
         ├─ fetches trusted AnyFlip metadata
         └─ inserts through user's Supabase session

Supabase
  ├─ Auth users
  └─ public.library_books with RLS
```

No service-role key. Server actions use the signed-in user's cookie session, so RLS remains the authorization boundary.

## 5. Environment

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not used while the publishable key is configured.

Never use or commit:

- PostgreSQL password.
- `DATABASE_URL`.
- `DIRECT_URL`.
- `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Database

Migration file: `supabase/migrations/<timestamp>_create_library_books.sql`.

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
```

RLS policies permit authenticated users to select, insert, update, and delete rows only when `auth.uid() = user_id`. Insert and update both include `with check` clauses.

Progress percentage is derived at read time:

```text
round(last_page / page_count * 100)
```

No redundant percentage column.

## 7. Routes and components

### Routes

- `/` — current public entry, plus minimal Login/Library navigation based on session where practical.
- `/login` — email/password login.
- `/register` — public registration.
- `/library` — protected server page and library collection.
- `/read/[publisherId]/[bookId]` — existing public reader; signed-in progress integration added.

### Components

- `AuthForm` — shared login/register form behavior with explicit mode.
- `LibraryAddBookForm` — AnyFlip URL submit, pending state, field error, result refresh.
- `LibraryBookList` — semantic list of real rows, honest empty state.
- `LibraryBookItem` — title, progress, Continue Reading, Delete.
- Existing `BookReader` receives optional persisted-progress support without coupling rendering to database queries.

No sidebar. Library screen job is selecting or adding a book, so hierarchy is:

1. Compact top navigation and account action.
2. Add-book form.
3. Continue-reading-first library list ordered by latest reading activity.

## 8. Add-book flow

1. User submits a URL from `/library`.
2. Server action verifies authenticated session.
3. `parseAnyFlipUrl` enforces HTTPS, exact `online.anyflip.com` host, no credentials, and valid IDs.
4. `fetchAnyFlipBook` validates public upstream metadata with existing size, redirect, page-count, and asset-path controls.
5. Server inserts `{ user_id, publisher_id, book_id, title, page_count }` using the user's Supabase session.
6. Unique conflict becomes `Book already exists in your library.`
7. Success revalidates `/library` and resets the form.

The browser never supplies trusted title, page count, or user ID.

## 9. Progress flow

1. Reader obtains the current signed-in session in the browser.
2. It looks up a matching `library_books` row by `publisher_id + book_id`.
3. If no row exists, no progress write occurs.
4. Page-turn state schedules a debounced update, initially 750 ms.
5. Update sets `last_page` and `last_read_at` for the matching owned row.
6. Only the latest page within the debounce window is sent.
7. Page values are clamped to `1..page_count` before write.
8. Failed background writes do not break navigation; a small non-blocking save-error state appears and retries on the next page change.
9. Pending progress is flushed on `visibilitychange` when the document becomes hidden where feasible; normal debounce remains the primary path.

RLS prevents another user's row from being read or updated even if an ID is guessed.

## 10. Session and route protection

- Browser and server Supabase clients follow current `@supabase/ssr` cookie patterns.
- Next.js proxy refreshes expired auth cookies.
- Proxy does not become the only authorization check.
- `/library` server page calls `auth.getUser()` and redirects unauthenticated requests.
- Mutations call `auth.getUser()` again before accessing data.
- Login honors only a fixed internal `next` path; external redirects are rejected.
- Authenticated users visiting `/login` or `/register` are redirected to `/library`.

## 11. Error handling

- Missing env: fail with a clear server configuration error; never print key values.
- Invalid AnyFlip URL: field-level message.
- Private, missing, malformed, or unavailable AnyFlip book: readable add-book error.
- Duplicate book: readable no-op error.
- Auth failure: generic invalid email/password message.
- Library query failure: page-level retry state, not an empty library claim.
- Delete requires an explicit confirmation before mutation.
- Progress failure remains non-blocking and preserves local reading navigation.

## 12. Security

- RLS enabled before table use.
- No service-role key in app code.
- No direct database credentials in app runtime.
- No raw user-controlled upstream URL fetch; reuse validated AnyFlip identity and fixed-origin fetch.
- No private books, auth bypass, paywall bypass, or asset mirroring.
- Auth cookies use Supabase SSR defaults and are not exposed to application JavaScript as raw tokens.
- Generic auth errors reduce account enumeration.
- Supabase Auth rate limits provide MVP abuse control; CAPTCHA is deferred until abuse appears.

## 13. Testing

### Unit and source-contract tests

- Auth redirect accepts only internal paths.
- Add-book parsing rejects invalid host, credentials, port, malformed IDs, and non-HTTPS input through existing AnyFlip tests.
- Progress page clamp.
- Progress debounce keeps latest page.
- Duplicate database error maps to readable UI text.
- Protected route and mutations verify the user.
- RLS migration contains select/insert/update/delete ownership policies and unique constraint.

### Build gates

```bash
npm test
npx eslint .
npx tsc --noEmit
npm run build
```

### Runtime verification

Against the configured Supabase project:

1. Register a new account without email confirmation.
2. Session reaches `/library`.
3. Add a known public AnyFlip URL.
4. Duplicate add is rejected cleanly.
5. Open book, navigate pages, wait for debounce.
6. Reload library and verify last page/progress.
7. Continue Reading opens the stored page.
8. Different test user cannot read or modify the first user's row.
9. Delete removes only the signed-in user's book.
10. Logout blocks `/library` and leaves public reader available.

## 14. Delivery and migration

- Commit `.env.example`, never `.env.local`.
- SQL migration is versioned in repository.
- Apply migration through Supabase SQL Editor or Supabase CLI after explicit approval.
- Disable Confirm email manually in Supabase Dashboard before runtime registration verification.
- Add Vercel environment variables separately for Preview and Production.
- Deployment remains Git-driven through current Vercel setup.

## 15. Acceptance criteria

- Public user can register and immediately obtain a session.
- Signed-in user can add, list, continue, and delete own books.
- Reading progress survives reload and new devices.
- One user's library is inaccessible to another user through UI and direct Supabase queries.
- Existing public URL-to-reader flow, gestures, keyboard navigation, zoom, and page-turn animation keep working.
- No database password, service-role key, or `.env.local` enters Git.
