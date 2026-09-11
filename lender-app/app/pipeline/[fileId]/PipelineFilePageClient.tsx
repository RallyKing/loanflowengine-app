"use client";

import dynamic from "next/dynamic";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Lightweight fallback while the (client-only) workspace chunk downloads. Keeps
 * the transition from a blank flash to a calm loading state; the workspace still
 * renders its own data-loading UI once mounted. Non-misleading: no fake content.
 */
function FileWorkspaceLoading() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">Loading file…</p>
    </div>
  );
}

const PipelineFileWorkspace = dynamic(
  () =>
    import("@/components/PipelineFileWorkspace").then((m) => ({
      default: m.PipelineFileWorkspace,
    })),
  { ssr: false, loading: () => <FileWorkspaceLoading /> },
);

export function PipelineFilePageClient({ fileId }: { fileId: string }) {
  return (
    <PipelineFileWorkspace
      key={fileId}
      fileId={fileId as Id<"pipeline">}
    />
  );
}
