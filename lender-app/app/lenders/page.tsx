import { Suspense } from "react";
import { LendersWorkspaceClient } from "./LendersWorkspaceClient";

function LendersFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lenders</h1>
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
      <div
        className="flex flex-col items-start gap-2 py-2"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
      </div>
    </div>
  );
}

export default function LendersPage() {
  return (
    <Suspense fallback={<LendersFallback />}>
      <LendersWorkspaceClient />
    </Suspense>
  );
}
