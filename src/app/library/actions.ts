"use server";

import { revalidatePath } from "next/cache";

import {
  AnyFlipNotFoundError,
  AnyFlipUpstreamError,
  fetchAnyFlipBook,
  parseAnyFlipUrl,
} from "@/lib/anyflip";
import { libraryMutationError } from "@/lib/library";
import { createServerClient } from "@/lib/supabase/server";

export type LibraryActionState = { error: string; success: string };

const EMPTY_STATE: LibraryActionState = { error: "", success: "" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 180;

function isOwnedBlobUrl(value: string, userId: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith(`/books/${userId}/`)
    );
  } catch {
    return false;
  }
}

export async function addBook(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ...EMPTY_STATE, error: "Log in to update your library." };

  let identity;
  try {
    identity = parseAnyFlipUrl(String(formData.get("url") ?? "").trim());
  } catch {
    return { ...EMPTY_STATE, error: "Enter a valid public AnyFlip URL." };
  }

  let metadata;
  try {
    metadata = await fetchAnyFlipBook(identity);
  } catch (error) {
    if (error instanceof AnyFlipNotFoundError) {
      return { ...EMPTY_STATE, error: "AnyFlip book not found or not public." };
    }
    if (error instanceof AnyFlipUpstreamError) {
      return { ...EMPTY_STATE, error: "Unable to read this AnyFlip book right now." };
    }
    return { ...EMPTY_STATE, error: "Unable to read this AnyFlip book." };
  }

  const { error } = await supabase.from("library_books").insert({
    user_id: user.id,
    publisher_id: identity.publisherId,
    book_id: identity.bookId,
    source_type: "anyflip",
    title: metadata.title,
    page_count: metadata.pageCount,
    last_page: 1,
    cover_url: metadata.pages[0] ?? null,
  });
  if (error) return { ...EMPTY_STATE, error: libraryMutationError(error.code) };

  revalidatePath("/library");
  return { error: "", success: "Book added to your library." };
}

export async function addUploadedBook(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ...EMPTY_STATE, error: "Log in to update your library." };

  const sourceType = String(formData.get("sourceType") ?? "");
  const blobUrl = String(formData.get("blobUrl") ?? "");
  const coverUrl = String(formData.get("coverUrl") ?? "");
  const fileName = String(formData.get("fileName") ?? "").trim();
  const rawTitle = String(formData.get("title") ?? "").trim();
  const pageCount = Number(formData.get("pageCount"));
  const uploadId = String(formData.get("uploadId") ?? "");

  if (
    (sourceType !== "pdf" && sourceType !== "epub") ||
    !isOwnedBlobUrl(blobUrl, user.id) ||
    !UUID_PATTERN.test(uploadId) ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > 100_000 ||
    fileName.length < 1 ||
    fileName.length > 255
  ) {
    return { ...EMPTY_STATE, error: "Invalid uploaded book details." };
  }

  const title = (rawTitle || fileName.replace(/\.[^.]+$/, "")).slice(0, MAX_TITLE_LENGTH);
  const { error } = await supabase.from("library_books").insert({
    user_id: user.id,
    publisher_id: "library",
    book_id: uploadId,
    source_type: sourceType,
    title,
    page_count: pageCount,
    last_page: 1,
    blob_url: blobUrl,
    cover_url: isOwnedBlobUrl(coverUrl, user.id) ? coverUrl : null,
    file_name: fileName,
  });
  if (error) return { ...EMPTY_STATE, error: libraryMutationError(error.code) };

  revalidatePath("/library");
  return { error: "", success: "Book added to your library." };
}

export async function deleteBook(formData: FormData): Promise<void> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Unauthorized");

  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) throw new Error("Invalid book ID");

  const { error } = await supabase
    .from("library_books")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(libraryMutationError(error.code));
  revalidatePath("/library");
}
