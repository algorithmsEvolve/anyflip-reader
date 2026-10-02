export type BookIdentity = {
  publisherId: string;
  bookId: string;
};

const BOOK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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
