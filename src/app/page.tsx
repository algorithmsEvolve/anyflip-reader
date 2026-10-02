import { BookUrlForm } from "@/components/book-url-form";

export default function Home() {
  return (
    <main className="landing">
      <section className="landing-copy" aria-labelledby="page-title">
        <p className="wordmark">Pagekeeper</p>
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
