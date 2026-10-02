import assert from "node:assert/strict";
import test from "node:test";

import { isValidBookId, parseAnyFlipUrl } from "./anyflip";

test("parses a mobile AnyFlip URL", () => {
  assert.deepEqual(
    parseAnyFlipUrl("https://online.anyflip.com/iehyo/byxp/mobile/index.html"),
    { publisherId: "iehyo", bookId: "byxp" },
  );
});

test("parses a root AnyFlip book URL", () => {
  assert.deepEqual(parseAnyFlipUrl("https://online.anyflip.com/iehyo/byxp/"), {
    publisherId: "iehyo",
    bookId: "byxp",
  });
});

test("rejects non-HTTPS URLs", () => {
  assert.throws(() => parseAnyFlipUrl("http://online.anyflip.com/iehyo/byxp/"));
});

test("rejects wrong hosts", () => {
  assert.throws(() => parseAnyFlipUrl("https://evil.example/iehyo/byxp/"));
});

test("rejects custom ports", () => {
  assert.throws(() =>
    parseAnyFlipUrl("https://online.anyflip.com:444/iehyo/byxp/"),
  );
});

test("rejects credentials", () => {
  assert.throws(() =>
    parseAnyFlipUrl("https://user@online.anyflip.com/iehyo/byxp/"),
  );
});

test("rejects missing book segments", () => {
  assert.throws(() => parseAnyFlipUrl("https://online.anyflip.com/iehyo/"));
});

test("accepts only alphanumeric, underscore, and hyphen IDs", () => {
  assert.equal(isValidBookId("Abc_123-x"), true);
  assert.equal(isValidBookId("abc.def"), false);
  assert.equal(isValidBookId(""), false);
  assert.throws(() => parseAnyFlipUrl("https://online.anyflip.com/iehyo/b%20ook/"));
});
