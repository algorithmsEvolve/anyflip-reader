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
    title: metadata.title,
    page_count: metadata.pageCount,
    last_page: 1,
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
