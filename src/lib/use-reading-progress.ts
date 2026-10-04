"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clampProgressPage } from "@/lib/library";
import { createBrowserClient } from "@/lib/supabase/client";

const SAVE_DELAY = 750;

type ReadingProgressOptions = {
  publisherId: string;
  bookId: string;
  page: number;
  pageCount: number;
};

export function useReadingProgress({
  publisherId,
  bookId,
  page,
  pageCount,
}: ReadingProgressOptions): { saveError: string } {
  const supabase = useMemo(() => createBrowserClient(), []);
  const identityKey = `${publisherId}/${bookId}`;
  const [row, setRow] = useState<{ identityKey: string; id: string } | null>(null);
  const rowId = row?.identityKey === identityKey ? row.id : null;
  const [saveError, setSaveError] = useState("");
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const pendingPageRef = useRef(page);
  const lastSavedPageRef = useRef<number | null>(null);

  useEffect(() => {
    const generation = ++generationRef.current;
    lastSavedPageRef.current = null;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (generation !== generationRef.current) return;
      if (!data.user) {
        setRow(null);
        setSaveError("");
        return;
      }
      const { data: book } = await supabase
        .from("library_books")
        .select("id,last_page")
        .eq("publisher_id", publisherId)
        .eq("book_id", bookId)
        .maybeSingle();
      if (!book || generation !== generationRef.current) return;
      lastSavedPageRef.current = book.last_page;
      setRow({ identityKey, id: book.id });
      setSaveError("");
    });

    return () => {
      generationRef.current += 1;
    };
  }, [bookId, identityKey, publisherId, supabase]);

  const save = useCallback(
    async (pageToSave: number) => {
      if (!rowId) return;
      const page = pageToSave;
      const clampedPage = clampProgressPage(page, pageCount);
      if (clampedPage === lastSavedPageRef.current) return;
      const generation = generationRef.current;
      const { error } = await supabase
        .from("library_books")
        .update({
          last_page: clampProgressPage(page, pageCount),
          last_read_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      if (generation !== generationRef.current) return;
      if (error) {
        setSaveError("Progress could not be saved.");
        return;
      }
      lastSavedPageRef.current = clampedPage;
      setSaveError("");
    },
    [pageCount, rowId, supabase],
  );

  useEffect(() => {
    pendingPageRef.current = page;
    if (!rowId || page === lastSavedPageRef.current) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void save(pendingPageRef.current);
    }, SAVE_DELAY);

    const flushWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      void save(pendingPageRef.current);
    };
    document.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [page, rowId, save]);

  return { saveError };
}
