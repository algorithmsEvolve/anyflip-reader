"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBook,
  type LibraryActionState,
} from "@/app/library/actions";

const initialState: LibraryActionState = { error: "", success: "" };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add book"}
    </button>
  );
}

export function LibraryAddBookForm() {
  const [state, action] = useActionState(addBook, initialState);

  return (
    <form className="library-add-form" action={action}>
      <label htmlFor="library-url">AnyFlip URL</label>
      <p id="library-url-help">Add a public AnyFlip book to your private shelf.</p>
      <div className="form-row">
        <input
          id="library-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://online.anyflip.com/…"
          aria-describedby="library-url-help library-form-status"
          required
        />
        <AddButton />
      </div>
      <p
        id="library-form-status"
        className={state.error ? "form-error" : "form-success"}
        role="status"
        aria-live="polite"
      >
        {state.error || state.success}
      </p>
    </form>
  );
}
