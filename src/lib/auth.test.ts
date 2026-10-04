import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authErrorMessage, safeNextPath } from "./auth";

test("safeNextPath accepts only internal application paths", () => {
  assert.equal(safeNextPath("/library"), "/library");
  assert.equal(safeNextPath("/read/a/b?page=4"), "/read/a/b?page=4");
  assert.equal(safeNextPath("https://evil.example"), "/library");
  assert.equal(safeNextPath("//evil.example"), "/library");
  assert.equal(safeNextPath("javascript:alert(1)"), "/library");
});

test("auth errors stay generic", () => {
  assert.equal(authErrorMessage("login"), "Invalid email or password.");
  assert.equal(authErrorMessage("register"), "Unable to create account.");
});

test("auth actions and proxy enforce authenticated sessions", () => {
  const actions = readFileSync(
    new URL("../app/auth/actions.ts", import.meta.url),
    "utf8",
  );
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

  assert.match(actions, /auth\.getUser\(\)/);
  assert.match(actions, /auth\.signInWithPassword/);
  assert.match(actions, /auth\.signUp/);
  assert.match(actions, /auth\.signOut/);
  assert.match(proxy, /request\.nextUrl\.pathname === "\/library"/);
  assert.match(proxy, /NextResponse\.redirect\(loginUrl\)/);
  assert.doesNotMatch(actions, /service.role|SERVICE_ROLE/);
});
