"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { LibraryBook } from "@/lib/library";
import { createBrowserClient } from "@/lib/supabase/client";
import { useReadingProgress } from "@/lib/use-reading-progress";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type UploadedBookReaderProps = { id: string; initialPage?: string };
type EpubRendition = {
  display: (target?: string) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  destroy?: () => void;
  on: (event: string, callback: (location: { start?: { percentage?: number } }) => void) => void;
};

type EpubPublication = {
  renderTo: (element: HTMLElement, options: { width: string; height: string }) => EpubRendition;
  locations: {
    generate: (chars: number) => Promise<void>;
    length: () => number;
    cfiFromLocation: (location: number) => string;
  };
};

function clampPage(value: string | undefined, count: number): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) ? Math.min(Math.max(page, 1), count) : 1;
}

export default function UploadedBookReader({ id, initialPage }: UploadedBookReaderProps) {
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [error, setError] = useState("");
  const [pdfPages, setPdfPages] = useState(1);
  const [epubLocations, setEpubLocations] = useState(1);
  const [page, setPage] = useState(() => clampPage(initialPage, 1));
  const epubHost = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const epubLocationsRef = useRef(1);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.from("library_books")
      .select("id,user_id,source_type,publisher_id,book_id,title,page_count,last_page,cover_url,blob_url,file_name,last_read_at,created_at")
      .eq("id", id).maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError || !data || (data.source_type !== "pdf" && data.source_type !== "epub")) {
          setError("This book is not available.");
          return;
        }
        const loaded = data as LibraryBook;
        setBook(loaded);
        setPage(clampPage(initialPage, loaded.page_count));
      });
  }, [id, initialPage]);

  useEffect(() => {
    const blobUrl = book?.blob_url;
    if (!book || book.source_type !== "epub" || !blobUrl || !epubHost.current) return;
    let destroyed = false;
    void import("epubjs").then(({ default: ePub }) => {
      if (destroyed || !epubHost.current) return;
      const publication = ePub(blobUrl) as unknown as EpubPublication;
      const rendition = publication.renderTo(epubHost.current, { width: "100%", height: "100%" });
      renditionRef.current = rendition;
      rendition.on("relocated", (location) => {
        const percentage = location.start?.percentage ?? 0;
        setPage(Math.max(1, Math.round(percentage * Math.max(1, epubLocationsRef.current - 1)) + 1));
      });
      return rendition.display().then(() => publication.locations.generate(1_024)).then(() => {
        const count = Math.max(1, publication.locations.length());
        const resumePage = clampPage(initialPage, count);
        epubLocationsRef.current = count;
        setEpubLocations(count);
        setPage(resumePage);
        if (count !== book.page_count) {
          void createBrowserClient().from("library_books").update({ page_count: count }).eq("id", book.id);
        }
        return rendition.display(publication.locations.cfiFromLocation(resumePage - 1));
      });
    }).catch(() => setError("Unable to open this EPUB."));
    return () => { destroyed = true; renditionRef.current?.destroy?.(); renditionRef.current = null; };
  }, [book, initialPage]);

  const pageCount = book?.source_type === "pdf" ? pdfPages : epubLocations;
  const { saveError } = useReadingProgress({
    publisherId: "library",
    bookId: book?.book_id ?? id,
    page,
    pageCount,
  });

  useEffect(() => {
    if (!book || page < 1) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("page") === String(page)) return;
    url.searchParams.set("page", String(page));
    window.history.replaceState(null, "", url);
  }, [book, page]);

  if (error) return <main className="reader-state"><p role="alert">{error}</p></main>;
  if (!book || !book.blob_url) return <main className="reader-state" aria-busy="true"><p>Opening book…</p></main>;

  const changePdfPage = (delta: number) => setPage((current) => Math.min(Math.max(1, current + delta), pageCount));
  const changeEpubPage = (direction: "next" | "prev") => {
    void renditionRef.current?.[direction]();
  };

  return (
    <main className="document-reader">
      <header className="document-reader-header">
        <Link href="/library">Library</Link><p>{book.title}</p><span>{book.source_type.toUpperCase()}</span>
      </header>
      {book.source_type === "pdf" ? (
        <div className="pdf-reader">
          <Document file={book.blob_url} onLoadSuccess={({ numPages }) => {
            setPdfPages(numPages);
            setPage((current) => clampPage(String(current), numPages));
            if (numPages !== book.page_count) {
              void createBrowserClient().from("library_books").update({ page_count: numPages }).eq("id", book.id);
            }
          }} onLoadError={() => setError("Unable to open this PDF.")} loading={<p>Opening PDF…</p>}>
            <Page pageNumber={page} />
          </Document>
        </div>
      ) : <div ref={epubHost} className="epub-reader" aria-label={book.title} />}
      <footer className="document-reader-controls">
        <button type="button" onClick={() => book.source_type === "pdf" ? changePdfPage(-1) : changeEpubPage("prev")} disabled={page <= 1}>Previous</button>
        <p>Page {page}{book.source_type === "pdf" ? ` of ${pageCount}` : ""}</p>
        <button type="button" onClick={() => book.source_type === "pdf" ? changePdfPage(1) : changeEpubPage("next")} disabled={book.source_type === "pdf" && page >= pageCount}>Next</button>
        {saveError && <p className="save-error" role="status">{saveError}</p>}
      </footer>
    </main>
  );
}
