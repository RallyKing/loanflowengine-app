import type { ReactNode } from "react";
import { ShareViewClient } from "./ShareViewClient";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { isShareSection } from "@/convex/shareSections";
import { parseConvexPublicUrl } from "@/lib/convexPublicUrl";

export const dynamic = "force-dynamic";

function ShareServerMessage({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-destructive/30 bg-destructive/[0.08] text-destructive"
      : "border-border/80 bg-muted/40 text-foreground";
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div
        className={`max-w-lg rounded-2xl border p-6 text-center text-sm ${toneClass}`}
      >
        {children}
      </div>
    </div>
  );
}

export default async function ShareIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
        Set <code className="rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_CONVEX_URL</code>{" "}
        to open share links.
      </div>
    );
  }

  const parsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
  if (!parsed.ok) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
        Convex URL in environment is invalid. Fix{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_CONVEX_URL</code>.
      </div>
    );
  }

  try {
    const preloaded = await preloadQuery(
      api.shareLinks.getByToken,
      { token },
      { url: parsed.href, skipConvexDeploymentUrlCheck: true },
    );
    const data = preloadedQueryResult(preloaded);
    if (data.status === "not_found") {
      return (
        <ShareServerMessage tone="error">
          This share link is invalid or the intake no longer exists.
        </ShareServerMessage>
      );
    }
    if (data.status === "revoked") {
      return (
        <ShareServerMessage tone="error">
          This link has been revoked. Please contact the person who shared it with
          you.
        </ShareServerMessage>
      );
    }
    if (data.status === "expired") {
      return (
        <ShareServerMessage tone="error">
          This link has expired. Please request a new one.
        </ShareServerMessage>
      );
    }
    const sections = data.link.sections.filter(isShareSection);
    if (sections.length === 0) {
      return (
        <ShareServerMessage tone="error">
          This share link points to unknown sections.
        </ShareServerMessage>
      );
    }
    return <ShareViewClient token={token} preloaded={preloaded} />;
  } catch {
    return (
      <ShareServerMessage tone="error">
        Unable to reach the server for this share link. Check your connection and
        try again.
      </ShareServerMessage>
    );
  }
}
