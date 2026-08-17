import dynamic from "next/dynamic";
import { Suspense } from "react";

const pipelineLoadingFallback = (
  <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Pipeline</h1>
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
      <p className="text-sm text-muted-foreground">Loading pipeline…</p>
    </div>
    <div className="h-48 max-w-5xl animate-pulse rounded-dlc-xl border border-border/50 bg-dlc-surface-low/40 shadow-dlc-1" />
  </div>
);

const PipelinePageClient = dynamic(
  () =>
    import("./PipelinePageClient").then((m) => ({
      default: m.PipelinePageClient,
    })),
  {
    loading: () => pipelineLoadingFallback,
  }
);

export default function PipelinePage() {
  return (
    <Suspense fallback={pipelineLoadingFallback}>
      <PipelinePageClient />
    </Suspense>
  );
}
