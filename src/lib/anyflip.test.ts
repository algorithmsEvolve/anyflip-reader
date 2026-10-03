import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/books/[publisherId]/[bookId]/route";
import {
  AnyFlipNotFoundError,
  AnyFlipUpstreamError,
  MAX_CONFIG_BYTES,
  MAX_PAGE_COUNT,
  fetchAnyFlipBook,
  isValidBookId,
  parseAnyFlipConfig,
  parseAnyFlipUrl,
} from "./anyflip";

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

const identity = { publisherId: "abc", bookId: "xyz" };
const configSource = `var htmlConfig = {"fliphtml5_pages":[
  {"n":["../files/mobile/1.webp"],"t":"../files/thumb/1.webp"},
  {"n":["../files/mobile/2.webp"],"t":"../files/thumb/2.webp"}
],"meta":{"title":"Sample Book"}};`;

test("parses known AnyFlip htmlConfig shape", () => {
  assert.deepEqual(parseAnyFlipConfig(configSource, identity), {
    title: "Sample Book",
    pageCount: 2,
    pages: [
      "https://online.anyflip.com/abc/xyz/files/mobile/1.webp",
      "https://online.anyflip.com/abc/xyz/files/mobile/2.webp",
    ],
  });
});

test("uses fallback title when metadata title is absent", () => {
  const source =
    'var htmlConfig = {"fliphtml5_pages":[{"n":["../files/mobile/1.webp"]}]};';
  assert.equal(parseAnyFlipConfig(source, identity).title, "AnyFlip Book");
});

test("rejects executable and malformed config sources", () => {
  assert.throws(() => parseAnyFlipConfig("alert(1)", identity));
  assert.throws(() => parseAnyFlipConfig("var htmlConfig = {};", identity));
});

test("rejects config over the byte limit", () => {
  assert.throws(() =>
    parseAnyFlipConfig("x".repeat(MAX_CONFIG_BYTES + 1), identity),
  );
});

test("accepts the page-count ceiling and rejects overflow", () => {
  const source = (count: number) => `var htmlConfig = ${JSON.stringify({
    fliphtml5_pages: Array.from({ length: count }, (_, index) => ({
      n: [`../files/mobile/${index + 1}.webp`],
    })),
  })};`;

  assert.equal(parseAnyFlipConfig(source(MAX_PAGE_COUNT), identity).pageCount, MAX_PAGE_COUNT);
  assert.throws(() => parseAnyFlipConfig(source(MAX_PAGE_COUNT + 1), identity));
  assert.ok(MAX_PAGE_COUNT >= 324);
});

test("rejects external page URLs", () => {
  const source =
    'var htmlConfig = {"fliphtml5_pages":[{"n":["https://evil.example/1.webp"]}]};';
  assert.throws(() => parseAnyFlipConfig(source, identity));
});

test("rejects invalid identities before building page URLs", () => {
  assert.throws(() =>
    parseAnyFlipConfig(configSource, { publisherId: "../evil", bookId: "xyz" }),
  );
});

test("rejects non-WebP page paths", () => {
  const source =
    'var htmlConfig = {"fliphtml5_pages":[{"n":["../files/mobile/1.jpg"]}]};';
  assert.throws(() => parseAnyFlipConfig(source, identity));
});

test("fetch rejects invalid identities without a request", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch");
  await assert.rejects(
    fetchAnyFlipBook({ publisherId: "../evil", bookId: "xyz" }),
    AnyFlipUpstreamError,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("fetches only the fixed AnyFlip config URL without headers or cache", async (t) => {
  const signal = new AbortController().signal;
  let request: { input: string | URL | Request; init?: RequestInit } | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      request = { input, init };
      return new Response(configSource, { status: 200 });
    },
  );

  const metadata = await fetchAnyFlipBook(identity, signal);

  assert.equal(
    request?.input,
    "https://online.anyflip.com/abc/xyz/mobile/javascript/config.js",
  );
  assert.equal(request?.init?.cache, "no-store");
  assert.equal(request?.init?.redirect, "manual");
  assert.equal(request?.init?.signal instanceof AbortSignal, true);
  assert.equal(metadata.pageCount, 2);
});

test("combines caller cancellation with a mandatory timeout", async (t) => {
  const caller = new AbortController();
  const timeoutSignal = new AbortController().signal;
  const timeoutMock = t.mock.method(AbortSignal, "timeout", () => timeoutSignal);
  const anyMock = t.mock.method(AbortSignal, "any");
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(configSource, { status: 200 }),
  );

  await fetchAnyFlipBook(identity, caller.signal);

  assert.deepEqual(timeoutMock.mock.calls[0]?.arguments, [10_000]);
  assert.deepEqual(anyMock.mock.calls[0]?.arguments, [
    [caller.signal, timeoutSignal],
  ]);
});

test("rejects upstream redirects", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 302 }),
  );

  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
});

test("cancels rejected HTTP response bodies", async (t) => {
  let cancellations = 0;
  const responses = [403, 404, 302, 500].map(
    (status) =>
      new Response(
        new ReadableStream({
          cancel() {
            cancellations += 1;
          },
        }),
        { status },
      ),
  );
  t.mock.method(globalThis, "fetch", async () => responses.shift()!);

  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipNotFoundError);
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipNotFoundError);
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
  assert.equal(cancellations, 4);
});

test("preserves HTTP errors when response body cancellation rejects", async (t) => {
  const cases = [
    [403, AnyFlipNotFoundError, "AnyFlip book not found"],
    [404, AnyFlipNotFoundError, "AnyFlip book not found"],
    [302, AnyFlipUpstreamError, "AnyFlip returned 302"],
    [500, AnyFlipUpstreamError, "AnyFlip returned 500"],
  ] as const;
  const responses = cases.map(
    ([status]) =>
      new Response(
        new ReadableStream({
          cancel() {
            throw new Error("cancel failed");
          },
        }),
        { status },
      ),
  );
  t.mock.method(globalThis, "fetch", async () => responses.shift()!);

  for (const [, ErrorType, message] of cases) {
    await assert.rejects(fetchAnyFlipBook(identity), (error: unknown) => {
      assert.ok(error instanceof ErrorType);
      assert.equal(error.message, message);
      return true;
    });
  }
});

test("rejects oversized declared config before parsing", async (t) => {
  let cancelled = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        {
          status: 200,
          headers: { "content-length": String(MAX_CONFIG_BYTES + 1) },
        },
      ),
  );

  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
  assert.equal(cancelled, true);
});

test("preserves declared oversize error when body cancellation rejects", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            throw new Error("cancel failed");
          },
        }),
        {
          status: 200,
          headers: { "content-length": String(MAX_CONFIG_BYTES + 1) },
        },
      ),
  );

  await assert.rejects(fetchAnyFlipBook(identity), (error: unknown) => {
    assert.ok(error instanceof AnyFlipUpstreamError);
    assert.equal(error.message, "AnyFlip returned invalid config");
    assert.ok(error.cause instanceof Error);
    assert.equal(error.cause.message, "AnyFlip config exceeds byte limit");
    return true;
  });
});

test("cancels streamed config once byte limit is exceeded", async (t) => {
  let cancelled = false;
  const chunk = new Uint8Array(1_000_001);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(body, { status: 200 }),
  );

  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
  assert.equal(cancelled, true);
});

test("cancels and releases the reader when reading fails", async (t) => {
  let cancelled = false;
  let released = false;
  const response = new Response(new ReadableStream(), { status: 200 });
  t.mock.method(response.body!, "getReader", () =>
    ({
      async read() {
        throw new Error("read failed");
      },
      async cancel() {
        cancelled = true;
      },
      releaseLock() {
        released = true;
      },
    }) as unknown as ReadableStreamDefaultReader<Uint8Array>,
  );
  t.mock.method(globalThis, "fetch", async () => response);

  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
  assert.equal(cancelled, true);
  assert.equal(released, true);
});

test("maps upstream 403 and 404 responses to not found", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 403 }),
  );
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipNotFoundError);

  fetchMock.mock.mockImplementation(
    async () => new Response(null, { status: 404 }),
  );
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipNotFoundError);
});

test("maps other response and network failures to upstream errors", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 500 }),
  );
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);

  fetchMock.mock.mockImplementation(async () => {
    throw new Error("private network detail");
  });
  await assert.rejects(fetchAnyFlipBook(identity), AnyFlipUpstreamError);
});

const routeContext = (publisherId: string, bookId: string) => ({
  params: Promise.resolve({ publisherId, bookId }),
});

test("route rejects invalid IDs without fetching", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch");
  const response = await GET(new Request("http://localhost"), routeContext("bad.id", "xyz"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid book ID" });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("route returns metadata and forwards request cancellation", async (t) => {
  const controller = new AbortController();
  let upstreamSignal: AbortSignal | null | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return new Response(configSource, { status: 200 });
    },
  );
  const response = await GET(
    new Request("http://localhost", { signal: controller.signal }),
    routeContext("abc", "xyz"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), parseAnyFlipConfig(configSource, identity));
  controller.abort();
  assert.equal(upstreamSignal?.aborted, true);
});

test("route returns client-safe upstream errors and logs sanitized cause", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  let response = await GET(new Request("http://localhost"), routeContext("abc", "xyz"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Book not found" });

  fetchMock.mock.mockImplementation(async () => {
    throw new Error("private network detail");
  });
  response = await GET(new Request("http://localhost"), routeContext("abc", "xyz"));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Unable to load book" });
  assert.deepEqual(logs.at(-1), [
    "AnyFlip metadata fetch failed:",
    "AnyFlip request failed",
    "cause:",
    "private network detail",
  ]);
});
