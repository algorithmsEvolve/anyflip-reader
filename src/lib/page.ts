export function normalizePage(
  value: string | null | undefined,
  pageCount: number,
): number {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isNaN(page) ? 1 : Math.min(pageCount, Math.max(1, page));
}
