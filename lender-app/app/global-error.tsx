"use client";

import { useEffect } from "react";
import { log } from "@/lib/log";
import "./globals.css";

/**
 * Catches errors in the root `app/layout` (or other errors above `app/error` boundaries).
 * Must define its own `<html>`/`<body>`. Imports `globals.css` so Tailwind + design tokens
 * still apply when the root layout tree fails.
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error(
      error.digest ? `global-error digest=${error.digest}` : "global-error",
      error
    );
  }, [error]);

  return (
    <html lang="en" data-color-scheme="saas" suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-muted/30 px-6 py-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">
              Application error
            </h1>
            <p className="mt-2 text-sm text-muted-foreground" role="alert">
              {error.message || "Something went wrong. You can try reloading."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
