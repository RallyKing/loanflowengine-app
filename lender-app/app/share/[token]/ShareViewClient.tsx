"use client";

import nextDynamic from "next/dynamic";
import type { Preloaded } from "convex/react";
import { api } from "@/convex/_generated/api";

const ShareView = nextDynamic(
  () =>
    import("@/components/intake/ShareView").then((m) => m.ShareView),
  { ssr: false },
);

export function ShareViewClient({
  token,
  preloaded,
}: {
  token: string;
  preloaded?: Preloaded<typeof api.shareLinks.getByToken>;
}) {
  return <ShareView token={token} preloaded={preloaded} />;
}
