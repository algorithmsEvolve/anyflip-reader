import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/202610040001_create_library_books.sql",
  import.meta.url,
);

test("library migration enforces ownership and one copy per user", () => {
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(
    migration,
    /alter table public\.library_books enable row level security/i,
  );
  assert.match(migration, /unique \(user_id, publisher_id, book_id\)/i);
  assert.match(
    migration,
    /for select[\s\S]*auth\.uid\(\) = user_id/i,
  );
  assert.match(
    migration,
    /for insert[\s\S]*with check \(auth\.uid\(\) = user_id\)/i,
  );
  assert.match(
    migration,
    /for update[\s\S]*using \(auth\.uid\(\) = user_id\)[\s\S]*with check \(auth\.uid\(\) = user_id\)/i,
  );
  assert.match(
    migration,
    /for delete[\s\S]*auth\.uid\(\) = user_id/i,
  );
});

test("library progress clamps pages and maps mutation errors", async () => {
  const { clampProgressPage, libraryMutationError, libraryProgress } =
    await import("./library");

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

test("library actions derive trusted book data and enforce ownership", () => {
  const actions = readFileSync(
    new URL("../app/library/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /auth\.getUser\(\)/);
  assert.match(actions, /parseAnyFlipUrl/);
  assert.match(actions, /fetchAnyFlipBook/);
  assert.match(actions, /user_id: user\.id/);
  assert.match(actions, /publisher_id: identity\.publisherId/);
  assert.match(actions, /page_count: metadata\.pageCount/);
  assert.match(actions, /\.eq\("id", id\)/);
  assert.match(actions, /\.eq\("user_id", user\.id\)/);
  assert.match(actions, /revalidatePath\("\/library"\)/);
  assert.doesNotMatch(actions, /service.role|SERVICE_ROLE/);
});

test("library UI protects ownership and exposes real reader actions", () => {
  const page = readFileSync(
    new URL("../app/library/page.tsx", import.meta.url),
    "utf8",
  );
  const item = readFileSync(
    new URL("../components/library-book-item.tsx", import.meta.url),
    "utf8",
  );
  const form = readFileSync(
    new URL("../components/library-add-book-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /auth\.getUser\(\)/);
  assert.match(page, /redirect\("\/login\?next=\/library"\)/);
  assert.match(
    page,
    /order\("last_read_at", \{ ascending: false, nullsFirst: false \}\)/,
  );
  assert.match(item, /Continue reading/);
  assert.match(item, /\?page=\$\{book\.last_page\}/);
  assert.match(item, /confirm\(/);
  assert.match(form, /useActionState/);
});
