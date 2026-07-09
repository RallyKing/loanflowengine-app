"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Id } from "@/convex/_generated/dataModel";
import { PIPELINE_CLIENT_PROJECT_QUERY } from "@/lib/pipeline/routes";

const ClientWorkspaceShell = dynamic(
  () =>
    import("@/components/pipeline/ClientWorkspaceShell").then((m) => ({
      default: m.ClientWorkspaceShell,
    })),
  { ssr: false, loading: () => null },
);

export function ClientWorkspacePageClient({
  clientId,
}: {
  clientId: string;
}) {
  const searchParams = useSearchParams();
  const initialProjectId =
    searchParams.get(PIPELINE_CLIENT_PROJECT_QUERY)?.trim() || undefined;

  return (
    <ClientWorkspaceShell
      key={`${clientId}:${initialProjectId ?? ""}`}
      clientId={clientId as Id<"clients">}
      initialProjectId={initialProjectId}
    />
  );
}
