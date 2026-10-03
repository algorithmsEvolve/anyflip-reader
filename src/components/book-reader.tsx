"use client";

import Link from "next/link";
import HTMLFlipBook from "react-pageflip";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BookPage } from "@/components/book-page";
import type { BookMetadata } from "@/lib/anyflip";
import { normalizePage } from "@/lib/page";
import {
  canonicalPage,
  getBookMetadata,
  isLastSpread,
  isTypingTarget,
} from "@/lib/reader";

type BookReaderProps = {
  publisherId: string;
  bookId: string;
  initialPage?: string;
};

type FlipBookHandle = {
  pageFlip(): {
    flipNext(): void;
    flipPrev(): void;
    getSettings(): { flippingTime: number };
    turnToPage(page: number): void;
  };
};

const PORTRAIT_QUERY = "(orientation: portrait) and (max-width: 767px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REDUCED_MOTION_FLIPPING_TIME = 1;
const DEFAULT_FLIPPING_TIME = 600;

function replacePageInUrl(page: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  window.history.replaceState(null, "", url);
}

export default function BookReader({
  publisherId,
  bookId,
  initialPage,
}: BookReaderProps) {
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState("1");
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(PORTRAIT_QUERY).matches,
  );
  const [flippingTime, setFlippingTime] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches
      ? REDUCED_MOTION_FLIPPING_TIME
      : DEFAULT_FLIPPING_TIME,
  );
  const isPortraitRef = useRef(isPortrait);
  const currentPageRef = useRef(1);
  const bookRef = useRef<FlipBookHandle | null>(null);
  const pages = useMemo(
    () => metadata?.pages.map((src, index) => (
      <BookPage key={src} src={src} pageNumber={index + 1} />
    )) ?? [],
    [metadata],
  );

  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY);
    const updateMode = () => {
      isPortraitRef.current = media.matches;
      setIsPortrait(media.matches);
    };
    media.addEventListener("change", updateMode);
    return () => media.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateMotion = () => {
      const nextFlippingTime = media.matches
        ? REDUCED_MOTION_FLIPPING_TIME
        : DEFAULT_FLIPPING_TIME;
      setFlippingTime(nextFlippingTime);
      const settings = bookRef.current?.pageFlip().getSettings();
      if (settings) settings.flippingTime = nextFlippingTime;
    };
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/books/${encodeURIComponent(publisherId)}/${encodeURIComponent(bookId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body === "object" && body !== null &&
            typeof Reflect.get(body, "error") === "string"
              ? Reflect.get(body, "error")
              : "Unable to load book";
          throw new Error(message);
        }
        return getBookMetadata(body);
      })
      .then((book) => {
        const page = normalizePage(initialPage, book.pageCount);
        const visiblePage = canonicalPage(page, isPortraitRef.current);
        currentPageRef.current = visiblePage;
        setCurrentPage(visiblePage);
        setJumpPage(String(visiblePage));
        replacePageInUrl(visiblePage);
        setMetadata(book);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load book");
        }
      });

    return () => controller.abort();
  }, [publisherId, bookId, initialPage, attempt]);

  const setVisiblePage = useCallback((page: number, portrait = isPortraitRef.current) => {
    const visiblePage = canonicalPage(page, portrait);
    currentPageRef.current = visiblePage;
    setCurrentPage(visiblePage);
    setJumpPage(String(visiblePage));
    replacePageInUrl(visiblePage);
  }, []);

  const showPage = useCallback(
    (page: number) => {
      if (!metadata) return;
      const normalized = normalizePage(String(page), metadata.pageCount);
      const visiblePage = canonicalPage(normalized, isPortraitRef.current);
      bookRef.current?.pageFlip().turnToPage(visiblePage - 1);
      setVisiblePage(visiblePage);
    },
    [metadata, setVisiblePage],
  );

  const previous = useCallback(() => bookRef.current?.pageFlip().flipPrev(), []);
  const next = useCallback(() => bookRef.current?.pageFlip().flipNext(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target as HTMLElement | null)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous]);

  if (!metadata && !error) {
    return (
      <main className="reader-state" aria-busy="true">
        <p>Loading book pages…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="reader-state" role="alert">
        <h1>Book could not be opened</h1>
        <p>{error}</p>
        <div className="state-actions">
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
          <Link href="/">Open another book</Link>
        </div>
      </main>
    );
  }

  if (!metadata) return null;

  const startPage = canonicalPage(
    normalizePage(initialPage, metadata.pageCount),
    isPortrait,
  ) - 1;

  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    showPage(Number.parseInt(jumpPage, 10));
  };

  return (
    <main className="reader-shell">
      <header className="reader-header">
        <Link href="/" className="reader-back">Pagekeeper</Link>
        <h1>{metadata.title}</h1>
      </header>

      <section className="book-stage" aria-label={`${metadata.title} pages`}>
        <HTMLFlipBook
          ref={bookRef}
          className="flip-book"
          style={{}}
          width={600}
          height={800}
          minWidth={220}
          maxWidth={600}
          minHeight={320}
          maxHeight={800}
          size="stretch"
          startPage={startPage}
          drawShadow
          flippingTime={flippingTime}
          usePortrait={true}
          startZIndex={0}
          autoSize
          maxShadowOpacity={0.35}
          showCover
          mobileScrollSupport
          clickEventForward
          useMouseEvents
          swipeDistance={30}
          showPageCorners
          disableFlipByClick={false}
          onFlip={(event: { data: number }) => {
            setVisiblePage(event.data + 1);
          }}
          onChangeOrientation={(event: { data: "portrait" | "landscape" }) => {
            const portrait = event.data === "portrait";
            isPortraitRef.current = portrait;
            setIsPortrait(portrait);
            setVisiblePage(currentPageRef.current, portrait);
          }}
        >
          {pages}
        </HTMLFlipBook>
      </section>

      <footer className="reader-controls" aria-label="Reader controls">
        <button type="button" onClick={previous} disabled={currentPage <= 1}>Previous</button>
        <form onSubmit={submitJump} className="page-jump">
          <label htmlFor="page-jump">Page</label>
          <input
            id="page-jump"
            type="number"
            min={1}
            max={metadata.pageCount}
            value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value)}
            inputMode="numeric"
          />
          <button type="submit">Go</button>
        </form>
        <p className="page-status" aria-live="polite" aria-atomic="true">
          {currentPage} of {metadata.pageCount}
        </p>
        <button
          type="button"
          onClick={next}
          disabled={isLastSpread(currentPage, metadata.pageCount, isPortrait)}
        >
          Next
        </button>
      </footer>
    </main>
  );
}
