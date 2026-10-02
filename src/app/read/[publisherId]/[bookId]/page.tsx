"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const BookReader = dynamic(() => import("@/components/book-reader"), {
  ssr: false,
  loading: () => (
    <main className="reader-state" aria-busy="true">
      <p>Loading book reader…</p>
    </main>
  ),
});

type ReaderPageProps = {
  params: Promise<{ publisherId: string; bookId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default function ReaderPage({ params, searchParams }: ReaderPageProps) {
  const { publisherId, bookId } = use(params);
  const query = use(searchParams);
  const initialPage = Array.isArray(query.page) ? query.page[0] : query.page;

  return (
    <BookReader
      publisherId={publisherId}
      bookId={bookId}
      initialPage={initialPage}
    />
  );
}
