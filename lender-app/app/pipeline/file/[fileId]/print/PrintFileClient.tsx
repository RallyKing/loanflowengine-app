"use client";

import nextDynamic from "next/dynamic";
import type { Id } from "@/convex/_generated/dataModel";

const PrintView = nextDynamic(
  () =>
    import("@/components/intake/PrintView").then((m) => m.PrintView),
  { ssr: false }
);

export function PrintFileClient({ fileId }: { fileId: Id<"pipeline"> }) {
  return <PrintView fileId={fileId} />;
}
