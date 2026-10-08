import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import { LibraryAddBookForm } from "@/components/library-add-book-form";
import { LibraryBookItem } from "@/components/library-book-item";
import type { LibraryBook } from "@/lib/library";
import { createServerClient } from "@/lib/supabase/server";

export default async function LibraryPage() {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/library");

  const { data, error } = await supabase
    .from("library_books")
    .select("id,user_id,source_type,publisher_id,book_id,title,page_count,last_page,cover_url,blob_url,file_name,last_read_at,created_at")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const books = (data ?? []) as LibraryBook[];

  return (
    <main className="library-page">
      <nav className="site-nav" aria-label="Library navigation">
        <Link className="wordmark" href="/">Pagekeeper</Link>
        <form action={logout}>
          <button className="text-button" type="submit">Log out</button>
        </form>
      </nav>

      <header className="library-header">
        <div>
          <p className="eyebrow">Your shelf</p>
          <h1>Library</h1>
          <p>Every book in one place. Covers open straight into the reader, exactly where you stopped.</p>
        </div>
      </header>

      <LibraryAddBookForm />

      {error ? (
        <p className="library-message" role="alert">Unable to load your library.</p>
      ) : books.length === 0 ? (
        <section className="library-empty">
          <h2>No books saved yet.</h2>
          <p>Add a public AnyFlip URL or upload a PDF or EPUB above. Reading progress appears under each cover.</p>
        </section>
      ) : (
        <ul className="library-grid" aria-label="Saved books">
          {books.map((book) => (
            <LibraryBookItem key={book.id} book={book} />
          ))}
        </ul>
      )}
    </main>
  );
}
