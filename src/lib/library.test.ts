import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clampProgressPage,
  libraryMutationError,
  libraryProgress,
  resolveLibraryReadHref,
  type LibraryBook,
} from "./library";

const MIGRATIONS = [
  "202610040001_create_library_books.sql",
  "202610080001_support_mixed_source_library.sql",
].map((name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  ),
);
const MIXED_MIGRATION = MIGRATIONS[1];

test("mixed-source migration extends ownership-safe library rows", () => {
  assert.match(MIXED_MIGRATION, /source_type text/i);
  assert.match(MIXED_MIGRATION, /check \(\s*source_type in \('anyflip', 'pdf', 'epub'\)/i);
  assert.match(MIXED_MIGRATION, /cover_url text/i);
  assert.match(MIXED_MIGRATION, /blob_url text/i);
  assert.match(MIXED_MIGRATION, /file_name text/i);
  assert.match(MIXED_MIGRATION, /not null default 'anyflip'/i);
  assert.match(MIXED_MIGRATION, /constraint library_books_owner_book_unique/i);
  assert.match(MIXED_MIGRATION, /drop index if exists library_books_user_last_read_idx/i);
  assert.match(MIXED_MIGRATION, /create index library_books_user_last_read_idx/i);
  assert.match(MIXED_MIGRATION, /drop constraint if exists library_books_page_count_check/i);
  assert.match(MIXED_MIGRATION, /add constraint library_books_page_count_check\s*\n?\s*check \(page_count > 0\)/i);
  assert.match(MIXED_MIGRATION, /alter table public\.library_books enable row level security/i);
  assert.match(MIXED_MIGRATION, /for select[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(MIXED_MIGRATION, /for insert[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(MIXED_MIGRATION, /for update[\s\S]*using \(auth\.uid\(\) = user_id\)[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
  assert.match(MIXED_MIGRATION, /for delete[\s\S]*auth\.uid\(\) = user_id/i);
});

test("library progress clamps pages and maps mutation errors", async () => {
  assert.equal(libraryProgress(1, 377), 0);
  assert.equal(libraryProgress(189, 377), 50);
  assert.equal(libraryProgress(377, 377), 100);
  assert.equal(clampProgressPage(0, 377), 1);
  assert.equal(clampProgressPage(999, 377), 377);
  assert.equal(clampProgressPage(Number.NaN, 377), 1);
  assert.equal(
    libraryMutationError("23505"),
    "Book already exists in your library.",
  );
  assert.equal(libraryMutationError("other"), "Unable to update your library.");
});

const SAMPLE_BOOK: LibraryBook = {
  id: "00000000-0000-4000-8000-000000000000",
  user_id: "00000000-0000-4000-8000-000000000001",
  source_type: "anyflip",
  publisher_id: "iehyo",
  book_id: "byxp",
  title: "Sample Book",
  page_count: 377,
  last_page: 12,
  cover_url: null,
  blob_url: null,
  file_name: null,
  last_read_at: "2026-10-08T00:00:00.000Z",
  created_at: "2026-10-04T00:00:00.000Z",
};

test("read hrefs stay canonical per source type", () => {
  assert.equal(
    resolveLibraryReadHref(SAMPLE_BOOK),
    "/read/iehyo/byxp?page=12",
  );
  assert.equal(
    resolveLibraryReadHref({ ...SAMPLE_BOOK, source_type: "pdf" }),
    "/read/library/00000000-0000-4000-8000-000000000000?page=12",
  );
  assert.equal(
    resolveLibraryReadHref({ ...SAMPLE_BOOK, source_type: "epub" }),
    "/read/library/00000000-0000-4000-8000-000000000000?page=12",
  );
});
