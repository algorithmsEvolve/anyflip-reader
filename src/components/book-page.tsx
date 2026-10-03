"use client";

import { forwardRef, useState } from "react";

type BookPageProps = {
  pageNumber: number;
  src: string;
};

export const BookPage = forwardRef<HTMLDivElement, BookPageProps>(
  function BookPage({ pageNumber, src }, ref) {
    const [imageKey, setImageKey] = useState(0);
    const [status, setStatus] = useState<"loading" | "loaded" | "error">(
      "loading",
    );
    const imageUrl = `${src}${src.includes("?") ? "&" : "?"}retry=${imageKey}`;

    return (
      <div className="book-page" ref={ref} data-density={pageNumber === 1 ? "hard" : "soft"}>
        {status === "error" ? (
          <div className="page-image-error" role="group" aria-label={`Page ${pageNumber} image failed`}>
            <p>Page image failed to load.</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                setImageKey((key) => key + 1);
              }}
            >
              Retry page
            </button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- remote dimensions come from book metadata.
          <img
            key={imageKey}
            className={`page-image ${status === "loading" ? "is-loading" : ""}`}
            src={imageUrl}
            alt={`Page ${pageNumber}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        )}
        <span className="page-number" aria-hidden="true">{pageNumber}</span>
      </div>
    );
  },
);
