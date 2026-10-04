import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("reading progress debounces owner-scoped saves and flushes when hidden", () => {
  const source = readFileSync(
    new URL("./use-reading-progress.ts", import.meta.url),
    "utf8",
  );
  const reader = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const SAVE_DELAY = 750/);
  assert.match(source, /\.eq\("publisher_id", publisherId\)/);
  assert.match(source, /\.eq\("book_id", bookId\)/);
  assert.match(source, /last_page: clampProgressPage\(page, pageCount\)/);
  assert.match(source, /last_read_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange"/);
  assert.match(reader, /useReadingProgress\(/);
});
