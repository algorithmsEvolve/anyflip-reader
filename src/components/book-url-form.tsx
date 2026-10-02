"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { parseAnyFlipUrl } from "@/lib/anyflip";

const ERROR_MESSAGE =
  "Enter a public URL from online.anyflip.com, including its publisher and book IDs.";

export function BookUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const { publisherId, bookId } = parseAnyFlipUrl(url.trim());
      setError("");
      router.push(`/read/${publisherId}/${bookId}?page=1`);
    } catch {
      setError(ERROR_MESSAGE);
    }
  }

  return (
    <form className="book-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="book-url">AnyFlip book URL</label>
      <p id="book-url-help" className="field-help">
        Paste the address of a public book hosted on online.anyflip.com.
      </p>
      <div className="form-row">
        <input
          id="book-url"
          name="book-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://online.anyflip.com/iehyo/byxp/"
          value={url}
          aria-describedby="book-url-help book-url-error"
          aria-invalid={error ? "true" : "false"}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError("");
          }}
          required
        />
        <button type="submit">Open book</button>
      </div>
      <p id="book-url-error" className="form-error" role="alert">
        {error}
      </p>
    </form>
  );
}
