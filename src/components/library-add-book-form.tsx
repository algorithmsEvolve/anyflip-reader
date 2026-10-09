"use client";

import { upload } from "@vercel/blob/client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBook,
  addUploadedBook,
  type LibraryActionState,
} from "@/app/library/actions";
import { createBrowserClient } from "@/lib/supabase/client";

const initialState: LibraryActionState = { error: "", success: "" };
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

type ImportKind = "anyflip" | "upload";

function AddButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add to library"}</button>;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160);
}

async function pngBlobFromImage(source: Blob): Promise<Blob | null> {
  const image = await createImageBitmap(source);
  const scale = Math.min(1, 640 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function createCover(file: File, sourceType: "pdf" | "epub"): Promise<Blob | null> {
  try {
    if (sourceType === "pdf") {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: Math.min(1, 640 / page.getViewport({ scale: 1 }).width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    }

    const { default: ePub } = await import("epubjs");
    const publication = ePub(await file.arrayBuffer());
    await publication.ready;
    const coverUrl = await publication.coverUrl();
    publication.destroy();
    return coverUrl ? pngBlobFromImage(await fetch(coverUrl).then((response) => response.blob())) : null;
  } catch {
    return null;
  }
}

function UploadBookForm() {
  const [state, action] = useActionState(addUploadedBook, initialState);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStage, setUploadStage] = useState("");
  const [percent, setPercent] = useState(0);

  async function onSubmit(formData: FormData) {
    const selected = file;
    if (!selected) {
      setUploadError("Choose a PDF or EPUB file.");
      return;
    }
    const isPdf = selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    const isEpub = selected.type === "application/epub+zip" || selected.name.toLowerCase().endsWith(".epub");
    if (!isPdf && !isEpub) {
      setUploadError("Only PDF and EPUB files are supported.");
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setUploadError("Files must be 200 MB or smaller.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadStage("Preparing secure upload…");
    setPercent(0);
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Log in to upload books.");

      const sourceType = isPdf ? "pdf" : "epub";
      const uploadId = crypto.randomUUID();
      setUploadStage("Uploading book…");
      const blob = await upload(
        `books/${data.user.id}/${uploadId}-${safeFileName(selected.name)}`,
        selected,
        {
          access: "public",
          contentType: selected.type || (isPdf ? "application/pdf" : "application/epub+zip"),
          handleUploadUrl: "/api/books/upload",
          clientPayload: data.user.id,
          multipart: selected.size > 4 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setPercent(Math.round(percentage)),
        },
      );

      setUploadStage("Creating cover…");
      const cover = await createCover(selected, sourceType);
      setUploadStage(cover ? "Uploading cover…" : "Saving to library…");
      const coverBlob = cover ? await upload(
        `books/${data.user.id}/${uploadId}-cover.png`,
        cover,
        {
          access: "public",
          contentType: "image/png",
          handleUploadUrl: "/api/books/upload",
          clientPayload: data.user.id,
        },
      ) : null;

      setUploadStage("Saving to library…");
      formData.set("sourceType", sourceType);
      formData.set("blobUrl", blob.url);
      formData.set("coverUrl", coverBlob?.url ?? "");
      formData.set("fileName", selected.name);
      formData.set("title", selected.name.replace(/\.[^.]+$/, ""));
      formData.set("pageCount", "1");
      formData.set("uploadId", uploadId);
      action(formData);
      setFile(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      setUploadStage("");
    }
  }

  return (
    <form className="library-upload-form" action={onSubmit}>
      <label className="file-picker" htmlFor="library-file">
        <span>{file ? file.name : "Choose PDF or EPUB"}</span>
        <small>{file ? `${Math.ceil(file.size / 1024 / 1024)} MB` : "Max 200 MB"}</small>
        <input
          id="library-file"
          type="file"
          accept="application/pdf,.pdf,application/epub+zip,.epub"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button type="submit" disabled={uploading} aria-busy={uploading}>
        {uploading ? `Uploading ${percent}%` : "Upload book"}
      </button>
      {uploading ? (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <span>{uploadStage}</span>
        </div>
      ) : null}
      <p className={uploadError || state.error ? "form-error" : "form-success"} role="status" aria-live="polite">
        {uploadError || state.error || state.success}
      </p>
    </form>
  );
}

export function LibraryAddBookForm() {
  const [kind, setKind] = useState<ImportKind>("anyflip");
  const [state, action] = useActionState(addBook, initialState);

  return (
    <section className="library-add-panel" aria-label="Add a book">
      <div className="library-add-tabs" role="tablist" aria-label="Book source">
        <button className={kind === "anyflip" ? "is-active" : ""} type="button" role="tab" aria-selected={kind === "anyflip"} onClick={() => setKind("anyflip")}>AnyFlip URL</button>
        <button className={kind === "upload" ? "is-active" : ""} type="button" role="tab" aria-selected={kind === "upload"} onClick={() => setKind("upload")}>Upload file</button>
      </div>
      {kind === "anyflip" ? (
        <form className="library-add-form" action={action}>
          <label htmlFor="library-url">Public AnyFlip URL</label>
          <p id="library-url-help">The cover and page count are collected automatically.</p>
          <div className="form-row">
            <input id="library-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="https://online.anyflip.com/…" aria-describedby="library-url-help library-form-status" required />
            <AddButton />
          </div>
          <p id="library-form-status" className={state.error ? "form-error" : "form-success"} role="status" aria-live="polite">{state.error || state.success}</p>
        </form>
      ) : <UploadBookForm />}
    </section>
  );
}
