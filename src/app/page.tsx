import Link from "next/link";

import { BookUrlForm } from "@/components/book-url-form";
import { createServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();

  return (
    <main className="landing">
      <nav className="site-nav" aria-label="Account">
        <span className="wordmark">Pagekeeper</span>
        <div className="site-nav-links">
          {data.user ? (
            <Link href="/library">Library</Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/register">Create account</Link>
            </>
          )}
        </div>
      </nav>

      <section className="landing-copy" aria-labelledby="page-title">
        <h1 id="page-title">Keep the book.<br />Lose the clutter.</h1>
        <p className="introduction">
          Paste an AnyFlip link to open its pages in a focused reader with a
          stable address.
        </p>
      </section>

      <section className="reader-entry" aria-label="Open an AnyFlip book">
        <BookUrlForm />
        <p className="availability-note">
          Pagekeeper supports public AnyFlip books only. Private or restricted
          books cannot be opened.
        </p>
      </section>
    </main>
  );
}
