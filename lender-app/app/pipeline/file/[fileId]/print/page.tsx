import type { Id } from "@/convex/_generated/dataModel";
import { PrintFileClient } from "./PrintFileClient";

export const dynamic = "force-dynamic";

export default async function PipelineFilePrintPage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
        Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">
          NEXT_PUBLIC_CONVEX_URL
        </code>{" "}
        for print view.
      </div>
    );
  }
  return <PrintFileClient fileId={fileId as Id<"pipeline">} />;
}
