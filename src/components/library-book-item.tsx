"use client";

import Link from "next/link";

import { deleteBook } from "@/app/library/actions";
import { type LibraryBook, libraryProgress } from "@/lib/library";

export function LibraryBookItem({ book }: { book: LibraryBook }) {
  const progress = libraryProgress(book.last_page, book.page_count);
  const readerUrl = `/read/${book.publisher_id}/${book.book_id}?page=${book.last_page}`;

  return (
    <li className="library-book">
      <div className="library-book-copy">
        <h2>{book.title}</h2>
        <p>
          Page {book.last_page} of {book.page_count} · {progress}%
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`Reading progress for ${book.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="library-book-actions">
        <Link className="primary-link" href={readerUrl}>
          Continue reading
        </Link>
        <form
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
      </div>
    </li>
  );
}
