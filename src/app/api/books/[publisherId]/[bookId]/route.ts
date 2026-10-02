import { NextResponse } from "next/server";

import {
  AnyFlipNotFoundError,
  fetchAnyFlipBook,
  isValidBookId,
} from "@/lib/anyflip";

type RouteContext = {
  params: Promise<{ publisherId: string; bookId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const identity = await context.params;
  if (
    !isValidBookId(identity.publisherId) ||
    !isValidBookId(identity.bookId)
  ) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchAnyFlipBook(identity));
  } catch (error) {
    if (error instanceof AnyFlipNotFoundError) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    console.error(
      "AnyFlip metadata fetch failed:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Unable to load book" },
      { status: 502 },
    );
  }
}
