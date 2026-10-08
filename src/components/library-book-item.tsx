"use client";

import Link from "next/link";

import { deleteBook } from "@/app/library/actions";
import {
  type LibraryBook,
  libraryProgress,
  resolveLibraryReadHref,
} from "@/lib/library";

const SOURCE_LABEL: Record<LibraryBook["source_type"], string> = {
  anyflip: "AnyFlip",
  pdf: "PDF",
  epub: "EPUB",
};

function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

export function LibraryBookItem({ book }: { book: LibraryBook }) {
  const progress = libraryProgress(book.last_page, book.page_count);

  return (
    <li className="library-card">
      <Link className="library-card-link" href={resolveLibraryReadHref(book)}>
        <span className="library-cover" aria-hidden="true">
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- covers come from AnyFlip and Blob CDNs, not the local Image loader
            <img src={book.cover_url} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="library-cover-fallback">{initials(book.title)}</span>
          )}
          <span className="library-badge">{SOURCE_LABEL[book.source_type]}</span>
          <span className="library-progress" role="progressbar" aria-label={`Reading progress for ${book.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </span>
        </span>
        <span className="library-card-copy">
          <strong className="library-card-title">{book.title}</strong>
          <span className="library-card-meta">
            {book.last_page > 1 ? `Page ${book.last_page} of ${book.page_count} · ${progress}%` : `${book.page_count} pages`}
          </span>
        </span>
      </Link>
      <form
        className="library-card-remove"
        action={deleteBook}
        onSubmit={(event) => {
          if (!confirm(`Remove “${book.title}” from your library?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={book.id} />
        <button className="text-button" type="submit">Remove</button>
      </form>
    </li>
  );
}
