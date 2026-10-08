"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const UploadedBookReader = dynamic(
  () => import("@/components/uploaded-book-reader"),
  {
    ssr: false,
    loading: () => (
      <main className="reader-state" aria-busy="true">
        <p>Loading reader…</p>
      </main>
    ),
  },
);

type UploadedReaderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default function UploadedReaderPage({
  params,
  searchParams,
}: UploadedReaderPageProps) {
  const { id } = use(params);
  const query = use(searchParams);
  const initialPage = Array.isArray(query.page) ? query.page[0] : query.page;

  return <UploadedBookReader id={id} initialPage={initialPage} />;
}
