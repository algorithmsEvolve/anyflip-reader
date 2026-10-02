import assert from "node:assert/strict";
import test from "node:test";

import { getBookMetadata, isTypingTarget } from "./reader";

test("accepts complete book metadata", () => {
  assert.deepEqual(
    getBookMetadata({ title: "Book", pageCount: 2, pages: ["one", "two"] }),
    { title: "Book", pageCount: 2, pages: ["one", "two"] },
  );
});

test("rejects empty and inconsistent page metadata", () => {
  assert.throws(() => getBookMetadata({ title: "Book", pageCount: 0, pages: [] }));
  assert.throws(() =>
    getBookMetadata({ title: "Book", pageCount: 2, pages: ["one"] }),
  );
});

test("rejects malformed metadata fields", () => {
  assert.throws(() => getBookMetadata({ error: "Book not found" }));
  assert.throws(() =>
    getBookMetadata({ title: "Book", pageCount: 1, pages: [""] }),
  );
});

test("recognizes typing targets without requiring DOM globals", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON", isContentEditable: false }), false);
  assert.equal(isTypingTarget(null), false);
});
