"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const previewLoading = (
  <div
    className="flex min-h-[12rem] items-center justify-center gap-2 text-sm text-muted-foreground"
    role="status"
    aria-live="polite"
  >
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
    Loading preview…
  </div>
);

/** Code-split RichFilePreview so hubs/portals do not pay for it until open. */
export const RichFilePreviewLazy = dynamic(
  () =>
    import("@/components/library/preview/RichFilePreview").then((m) => ({
      default: m.RichFilePreview,
    })),
  {
    ssr: false,
    loading: () => previewLoading,
  },
);
