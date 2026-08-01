import type { ReactNode } from "react";
import { ClientPortalBundleClient } from "./ClientPortalBundleClient";
import { normalizePortalToken } from "@/lib/portalToken";

export const dynamic = "force-dynamic";

export default async function ClientPortalBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ bundleToken: string }>;
  searchParams: Promise<{ companySlug?: string }>;
}) {
  const { bundleToken } = await params;
  const { companySlug } = await searchParams;
  const normalized = normalizePortalToken(bundleToken ?? "");
  if (!normalized) {
    return <PortalMessage tone="error">Invalid portal link.</PortalMessage>;
  }
  return (
    <ClientPortalBundleClient
      bundleToken={normalized}
      companySlug={companySlug?.trim() || undefined}
    />
  );
}

function PortalMessage({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-neutral-200 bg-neutral-50 text-neutral-800";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6">
      <div
        className={`max-w-lg rounded-2xl border p-6 text-center text-sm ${toneClass}`}
      >
        {children}
      </div>
    </div>
  );
}
