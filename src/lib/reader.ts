import type { BookMetadata } from "./anyflip";

type KeyboardTarget = {
  tagName?: string;
  isContentEditable?: boolean;
};

export function getBookMetadata(value: unknown): BookMetadata {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid book metadata");
  }

  const title = Reflect.get(value, "title");
  const pageCount = Reflect.get(value, "pageCount");
  const pages = Reflect.get(value, "pages");
  if (
    typeof title !== "string" ||
    title.length === 0 ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    !Array.isArray(pages) ||
    pages.length !== pageCount ||
    !pages.every((page) => typeof page === "string" && page.length > 0)
  ) {
    throw new Error("Invalid book metadata");
  }

  return { title, pageCount, pages };
}

export function isTypingTarget(target: KeyboardTarget | null): boolean {
  const tagName = target?.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable === true
  );
}
