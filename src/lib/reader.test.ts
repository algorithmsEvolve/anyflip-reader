import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalPage,
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

test("uses visible leading page in landscape and exact page in portrait", () => {
  assert.equal(canonicalPage(1, false), 1);
  assert.equal(canonicalPage(2, false), 2);
  assert.equal(canonicalPage(3, false), 2);
  assert.equal(canonicalPage(37, false), 36);
  assert.equal(canonicalPage(37, true), 37);
});

test("canonicalizes load, flips, jumps, and orientation without remounting", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const setVisiblePage = useCallback/);
  assert.match(source, /const visiblePage = canonicalPage\(page, isPortraitRef\.current\)/);
  assert.match(source, /startPage = canonicalPage\(/);
  assert.match(source, /setVisiblePage\(event\.data \+ 1\)/);
  assert.match(source, /setVisiblePage\(currentPageRef\.current, portrait\)/);
  assert.doesNotMatch(source, /orientation[^\n]*key|key[^\n]*orientation/i);
});

test("keeps lazy async images and memoized PageFlip children", () => {
  const reader = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../components/book-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /loading="lazy"/);
  assert.match(page, /decoding="async"/);
  assert.match(reader, /const pages = useMemo\(/);
  assert.match(reader, /\{pages\}/);
  assert.doesNotMatch(reader, /\{metadata\.pages\.map/);
});

test("uses PageFlip minimum reduced-motion timing without remounting", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /REDUCED_MOTION_FLIPPING_TIME = 1/);
  assert.match(source, /flippingTime=\{flippingTime\}/);
  assert.match(source, /settings\.flippingTime = nextFlippingTime/);
  assert.match(source, /matchMedia\(REDUCED_MOTION_QUERY\)/);
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

test("keeps reader chrome hidden until the book is pressed", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /useState\(false\)/);
  assert.match(source, /onPointerDown=\{toggleChrome\}/);
  assert.doesNotMatch(source, /className="reader-controls"[\s\S]{0,160}onPointerDown/);
  assert.match(source, /showPage\(currentPage - \(isPortrait \? 1 : 2\)\)/);
  assert.match(source, /showPage\(currentPage \+ \(isPortrait \? 1 : 2\)\)/);
  assert.doesNotMatch(source, /\.flipPrev\(\)|\.flipNext\(\)/);
  assert.match(source, /disableFlipByClick=\{true\}/);
  assert.match(source, /window\.setTimeout\(hideChrome, CHROME_HIDE_DELAY\)/);
  assert.match(source, /reader-shell \$\{chromeVisible \? "is-chrome-visible" : ""\}/);
  assert.match(source, /inert=\{!chromeVisible \? true : undefined\}/);
  assert.match(css, /\.reader-header,[\s\S]*?\.reader-controls \{[\s\S]*?visibility: hidden;/);
  assert.match(css, /\.reader-shell\.is-chrome-visible \.reader-header/);
  assert.match(css, /\.reader-shell\.is-chrome-visible \.reader-controls/);
  assert.doesNotMatch(css, /\.reader-shell\.is-chrome-visible \.flip-book/);
});

test("uses floating safe-area-aware controls on mobile", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.reader-controls \{[\s\S]*?position: absolute;/);
  assert.match(css, /bottom: max\([^;]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 47\.9375rem\)[\s\S]*?\.reader-controls/);
  assert.match(css, /min-height: 2\.75rem/);
});

test("keeps portrait and narrow landscape on opposite sides of spread threshold", () => {
  const source = readFileSync(
    new URL("../components/book-reader.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const minWidth = Number(source.match(/minWidth=\{(\d+)\}/)?.[1]);
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
    /\.flip-book \{[\s\S]*?height: 100% !important;[\s\S]*?min-height: 0 !important;/,
  );
  assert.doesNotMatch(css, /\.flip-book \{[^}]*transform:/);
});
