import assert from "node:assert/strict";
import test from "node:test";

import {
  destroyFlipBook,
  getBookMetadata,
  isLastSpread,
  isTypingTarget,
} from "./reader";

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

test("recognizes final landscape spread while preserving its leading page", () => {
  assert.equal(isLastSpread(4, 5, false), true);
  assert.equal(isLastSpread(3, 5, false), false);
  assert.equal(isLastSpread(4, 6, false), false);
  assert.equal(isLastSpread(5, 6, false), false);
  assert.equal(isLastSpread(6, 6, false), true);
  assert.equal(isLastSpread(4, 5, true), false);
  assert.equal(isLastSpread(5, 5, true), true);
});

test("destroys current PageFlip instance and clears only its matching ref", () => {
  let destroyCount = 0;
  const handle = { pageFlip: () => ({ destroy: () => destroyCount++ }) };
  const ref: { current: typeof handle | null } = { current: handle };

  destroyFlipBook(handle, ref);

  assert.equal(destroyCount, 1);
  assert.equal(ref.current, null);

  const replacement = { pageFlip: () => ({ destroy: () => destroyCount++ }) };
  ref.current = replacement;
  destroyFlipBook(handle, ref);

  assert.equal(destroyCount, 2);
  assert.equal(ref.current, replacement);
});
