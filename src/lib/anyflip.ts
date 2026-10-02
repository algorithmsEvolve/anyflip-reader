export type BookIdentity = {
  publisherId: string;
  bookId: string;
};

export type BookMetadata = {
  title: string;
  pageCount: number;
  pages: string[];
};

export const MAX_CONFIG_BYTES = 2_000_000;

export class AnyFlipNotFoundError extends Error {}
export class AnyFlipUpstreamError extends Error {}

const BOOK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CONFIG_PREFIX = "var htmlConfig = ";
const PAGE_PATH_PATTERN = /^\.\.\/files\/mobile\/\d+\.webp$/;

export function isValidBookId(value: string): boolean {
  return BOOK_ID_PATTERN.test(value);
}

export function parseAnyFlipUrl(input: string): BookIdentity {
  const url = new URL(input);

  if (
    url.protocol !== "https:" ||
    url.host !== "online.anyflip.com" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Invalid AnyFlip URL");
  }

  const [, publisherId, bookId] = url.pathname.split("/");
  if (!isValidBookId(publisherId ?? "") || !isValidBookId(bookId ?? "")) {
    throw new Error("Invalid AnyFlip book ID");
  }

  return { publisherId, bookId };
}

export function parseAnyFlipConfig(
  source: string,
  identity: BookIdentity,
): BookMetadata {
  if (
    !isValidBookId(identity.publisherId) ||
    !isValidBookId(identity.bookId) ||
    new TextEncoder().encode(source).byteLength > MAX_CONFIG_BYTES ||
    !source.startsWith(CONFIG_PREFIX) ||
    !source.endsWith(";")
  ) {
    throw new Error("Invalid AnyFlip config");
  }

  let config: unknown;
  try {
    config = JSON.parse(source.slice(CONFIG_PREFIX.length, -1));
  } catch {
    throw new Error("Invalid AnyFlip config");
  }

  if (!isConfig(config)) {
    throw new Error("Invalid AnyFlip config");
  }

  const pages = config.fliphtml5_pages.map((page) => {
    const path = page.n[0];
    if (!PAGE_PATH_PATTERN.test(path)) {
      throw new Error("Invalid AnyFlip page path");
    }
    return `https://online.anyflip.com/${identity.publisherId}/${identity.bookId}/${path.slice(3)}`;
  });

  return {
    title:
      typeof config.meta?.title === "string" && config.meta.title.length > 0
        ? config.meta.title
        : "AnyFlip Book",
    pageCount: pages.length,
    pages,
  };
}

export async function fetchAnyFlipBook(
  identity: BookIdentity,
  signal?: AbortSignal,
): Promise<BookMetadata> {
  if (
    !isValidBookId(identity.publisherId) ||
    !isValidBookId(identity.bookId)
  ) {
    throw new AnyFlipUpstreamError("Invalid AnyFlip book ID");
  }

  const timeoutSignal = AbortSignal.timeout(10_000);
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(
      `https://online.anyflip.com/${identity.publisherId}/${identity.bookId}/mobile/javascript/config.js`,
      { cache: "no-store", redirect: "manual", signal: fetchSignal },
    );
  } catch (error) {
    throw new AnyFlipUpstreamError("AnyFlip request failed", { cause: error });
  }

  if (response.status === 403 || response.status === 404) {
    throw new AnyFlipNotFoundError("AnyFlip book not found");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new AnyFlipUpstreamError(`AnyFlip returned ${response.status}`);
  }
  if (!response.ok) {
    throw new AnyFlipUpstreamError(`AnyFlip returned ${response.status}`);
  }

  try {
    return parseAnyFlipConfig(await readConfig(response), identity);
  } catch (error) {
    if (error instanceof AnyFlipUpstreamError) throw error;
    throw new AnyFlipUpstreamError("AnyFlip returned invalid config", {
      cause: error,
    });
  }
}

async function readConfig(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_CONFIG_BYTES) {
    throw new Error("AnyFlip config exceeds byte limit");
  }
  if (!response.body) throw new Error("AnyFlip config body is missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_CONFIG_BYTES) {
      await reader.cancel();
      throw new Error("AnyFlip config exceeds byte limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isConfig(value: unknown): value is {
  fliphtml5_pages: Array<{ n: [string, ...unknown[]] }>;
  meta?: { title?: unknown };
} {
  if (typeof value !== "object" || value === null) return false;

  const pages = Reflect.get(value, "fliphtml5_pages");
  return (
    Array.isArray(pages) &&
    pages.length > 0 &&
    pages.every(
      (page) =>
        typeof page === "object" &&
        page !== null &&
        Array.isArray(Reflect.get(page, "n")) &&
        typeof Reflect.get(page, "n")[0] === "string",
    )
  );
}
