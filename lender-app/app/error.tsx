"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { log } from "@/lib/log";

/**
 * Segment error UI (nested under the root layout). For root layout failures
 * see `app/global-error.tsx`.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error(
      error.digest ? `route-error digest=${error.digest}` : "route-error",
      error
    );
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground" role="alert">
        {error.message || "An unexpected error occurred. You can try again."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="outline" onClick={() => (window.location.href = "/")}>
          Go home
        </Button>
      </div>
    </div>
  );
}
