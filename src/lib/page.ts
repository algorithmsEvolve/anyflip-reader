export function normalizePage(
  value: string | null | undefined,
  pageCount: number,
): number {
  const page = /^\d+$/.test(value ?? "") ? Number(value) : 1;
  return Math.min(pageCount, Math.max(1, page));
}
