import assert from "node:assert/strict";
import test from "node:test";

import { normalizePage } from "./page";

test("keeps an in-range page", () => {
  assert.equal(normalizePage("37", 324), 37);
});

test("clamps pages below one", () => {
  assert.equal(normalizePage("0", 324), 1);
});

test("clamps pages above page count", () => {
  assert.equal(normalizePage("999", 324), 324);
});

test("defaults invalid pages to one", () => {
  assert.equal(normalizePage("wat", 324), 1);
});
