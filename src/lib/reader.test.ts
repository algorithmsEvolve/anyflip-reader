import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getBookMetadata, isLastSpread, isTypingTarget } from "./reader";

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

test("keeps one responsive PageFlip instance without manual destruction", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );
  const flipBookProps = source.match(/<HTMLFlipBook[\s\S]*?>/)?.[0] ?? "";

  assert.match(flipBookProps, /ref=\{bookRef\}/);
  assert.match(flipBookProps, /usePortrait=\{true\}/);
  assert.doesNotMatch(flipBookProps, /\bkey=/);
  assert.doesNotMatch(source, /destroyFlipBook|\.destroy\(\)/);
});

test("keeps portrait and narrow landscape on opposite sides of spread threshold", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const minWidth = Number(source.match(/minWidth=\{(\d+)\}/)?.[1]);
  const minHeight = Number(source.match(/minHeight=\{(\d+)\}/)?.[1]);
  const portraitCap = Number(
    css.match(
      /@media \(max-width: 47\.9375rem\) and \(orientation: portrait\)[\s\S]*?\.flip-book \{\s*max-width: (\d+)px !important;/,
    )?.[1],
  );
  const spreadThreshold = 2 * minWidth;
  const portraitStageWidth = 320 - 2 * 12;
  const landscapeStageWidth = 480 - 2 * 16;

  assert.equal(minWidth, 220);
  assert.equal(portraitCap, 439);
  assert.ok(portraitCap < spreadThreshold);
  assert.ok(portraitStageWidth < spreadThreshold);
  assert.ok(landscapeStageWidth >= spreadThreshold);
  assert.match(
    css,
    new RegExp(
      `@media \\(max-height: ${minHeight + 144}px\\) and \\(orientation: landscape\\)[\\s\\S]*?\\.flip-book \\{[\\s\\S]*?transform: scale\\(calc\\(\\(100dvh - 9rem\\) / ${minHeight}\\)\\);`,
    ),
  );
});
