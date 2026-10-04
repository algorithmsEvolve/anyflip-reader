export type LibraryBook = {
  id: string;
  user_id: string;
  publisher_id: string;
  book_id: string;
  title: string;
  page_count: number;
  last_page: number;
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
