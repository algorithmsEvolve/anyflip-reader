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
  signal: AbortSignal = AbortSignal.timeout(10_000),
): Promise<BookMetadata> {
  if (
    !isValidBookId(identity.publisherId) ||
    !isValidBookId(identity.bookId)
  ) {
    throw new AnyFlipUpstreamError("Invalid AnyFlip book ID");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://online.anyflip.com/${identity.publisherId}/${identity.bookId}/mobile/javascript/config.js`,
      { cache: "no-store", signal },
    );
  } catch (error) {
    throw new AnyFlipUpstreamError("AnyFlip request failed", { cause: error });
  }

  if (response.status === 403 || response.status === 404) {
    throw new AnyFlipNotFoundError("AnyFlip book not found");
  }
  if (!response.ok) {
    throw new AnyFlipUpstreamError(`AnyFlip returned ${response.status}`);
  }

  try {
    return parseAnyFlipConfig(await response.text(), identity);
  } catch (error) {
    if (error instanceof AnyFlipUpstreamError) throw error;
    throw new AnyFlipUpstreamError("AnyFlip returned invalid config", {
      cause: error,
    });
  }
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
