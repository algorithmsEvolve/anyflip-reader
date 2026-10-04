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
    .select("id,user_id,publisher_id,book_id,title,page_count,last_page,last_read_at,created_at")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

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
          <p>Pick up where you stopped, without hunting for the page.</p>
        </div>
        <LibraryAddBookForm />
      </header>

      {error ? (
        <p className="library-message" role="alert">Unable to load your library.</p>
      ) : data.length === 0 ? (
        <section className="library-empty">
          <h2>No books saved yet.</h2>
          <p>Add a public AnyFlip URL above. Your reading progress will appear here.</p>
        </section>
      ) : (
        <ul className="library-list" aria-label="Saved books">
          {(data as LibraryBook[]).map((book) => (
            <LibraryBookItem key={book.id} book={book} />
          ))}
        </ul>
      )}
    </main>
  );
}
