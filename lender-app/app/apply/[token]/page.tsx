import type { ReactNode } from "react";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { parseConvexPublicUrl } from "@/lib/convexPublicUrl";
import { ApplyFormClient } from "./ApplyFormClient";

export const dynamic = "force-dynamic";

function ApplyMessage({
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

export default async function ApplyIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <ApplyMessage>
        Set <code className="rounded bg-muted px-1.5 py-0.5">NEXT_PUBLIC_CONVEX_URL</code>{" "}
        to open intake forms.
      </ApplyMessage>
    );
  }

  const parsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
  if (!parsed.ok) {
    return (
      <ApplyMessage tone="error">
        Convex URL in environment is invalid.
      </ApplyMessage>
    );
  }

  try {
    const preloaded = await preloadQuery(
      api.intakeForms.getByToken,
      { token },
      { url: parsed.href, skipConvexDeploymentUrlCheck: true },
    );
    const data = preloadedQueryResult(preloaded);
    if (data.status === "not_found") {
      return (
        <ApplyMessage tone="error">
          This intake link is invalid or no longer available.
        </ApplyMessage>
      );
    }
    if (data.status === "revoked") {
      return (
        <ApplyMessage tone="error">
          This link has been revoked. Contact your loan officer for a new link.
        </ApplyMessage>
      );
    }
    if (data.status === "expired") {
      return (
        <ApplyMessage tone="error">
          This link has expired. Contact your loan officer for a new link.
        </ApplyMessage>
      );
    }

    return <ApplyFormClient token={token} initial={data} />;
  } catch {
    return (
      <ApplyMessage tone="error">
        Unable to load this intake form. Try again later.
      </ApplyMessage>
    );
  }
}
