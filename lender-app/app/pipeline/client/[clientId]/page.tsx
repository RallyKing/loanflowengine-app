import { Suspense } from "react";
import { ClientWorkspacePageClient } from "./ClientWorkspacePageClient";

const clientWorkspaceFallback = (
  <div
    className="flex min-h-[40vh] flex-col"
    data-testid="pipeline-client-workspace-loading"
  >
    <div className="h-14 shrink-0 animate-pulse border-b border-border/50 bg-muted/20" />
  </div>
);

export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <Suspense fallback={clientWorkspaceFallback}>
      <ClientWorkspacePageClient clientId={clientId} />
    </Suspense>
  );
}
