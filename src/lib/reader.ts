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

export function canonicalPage(page: number, isPortrait: boolean): number {
  return isPortrait || page <= 1 || page % 2 === 0 ? page : page - 1;
}

export function classifyHorizontalGesture(
  startX: number,
  endX: number,
  startY = 0,
  endY = 0,
): "tap" | "ignore" | "previous" | "next" {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) return "tap";
  if (Math.abs(deltaX) <= Math.abs(deltaY)) return "ignore";
  return deltaX > 0 ? "previous" : "next";
}

export function isLastSpread(
  currentPage: number,
  pageCount: number,
  usePortrait: boolean,
): boolean {
  const lastLeadingPage =
    !usePortrait && pageCount % 2 === 1 ? pageCount - 1 : pageCount;
  return currentPage >= lastLeadingPage;
}
