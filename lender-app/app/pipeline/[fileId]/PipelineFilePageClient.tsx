"use client";

import dynamic from "next/dynamic";
import type { Id } from "@/convex/_generated/dataModel";

const PipelineFileWorkspace = dynamic(
  () =>
    import("@/components/PipelineFileWorkspace").then((m) => ({
      default: m.PipelineFileWorkspace,
    })),
  { ssr: false, loading: () => null },
);

export function PipelineFilePageClient({ fileId }: { fileId: string }) {
  return (
    <PipelineFileWorkspace
      key={fileId}
      fileId={fileId as Id<"pipeline">}
    />
  );
}
