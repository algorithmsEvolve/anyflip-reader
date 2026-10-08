export type SourceType = "anyflip" | "pdf" | "epub";

export type LibraryBook = {
  id: string;
  user_id: string;
  source_type: SourceType;
  publisher_id: string;
  book_id: string;
  title: string;
  page_count: number;
  last_page: number;
  cover_url: string | null;
  blob_url: string | null;
  file_name: string | null;
  last_read_at: string | null;
  created_at: string;
};

export function clampProgressPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || !Number.isFinite(pageCount)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, Math.trunc(pageCount)));
}

export function libraryProgress(lastPage: number, pageCount: number): number {
  const total = Math.max(1, Math.trunc(pageCount));
  const current = clampProgressPage(lastPage, total);
  if (total === 1) return 100;
  return Math.round(((current - 1) / (total - 1)) * 100);
}

export function libraryMutationError(code?: string): string {
  return code === "23505"
    ? "Book already exists in your library."
    : "Unable to update your library.";
}

export function resolveLibraryReadHref(book: LibraryBook): string {
  const page = clampProgressPage(book.last_page, book.page_count);
  if (book.source_type === "anyflip") {
    return `/read/${book.publisher_id}/${book.book_id}?page=${page}`;
  }
  return `/read/library/${book.id}?page=${page}`;
}

export function isSourceType(value: unknown): value is SourceType {
  return value === "anyflip" || value === "pdf" || value === "epub";
}
