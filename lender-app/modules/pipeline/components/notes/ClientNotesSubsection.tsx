"use client";

import { useCallback, useMemo, useState } from "react";
import { StickyNote } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { HubCollapsibleSubsection } from "@/components/pipeline/HubCollapsibleSubsection";
import { ClientNotesTimeline } from "@/components/pipeline/notes/ClientNotesTimeline";
import { ClientScopedNoteComposer } from "@/components/pipeline/notes/ClientScopedNoteComposer";
import { collectClientHubFileOptions } from "@/lib/pipeline/collectClientHubFileOptions";
import { loadHubClientNotesExpanded } from "@/lib/pipeline/hubClientNotesExpansion";
import type { HubClientNode } from "@/lib/pipeline/hubHierarchyTree";

export type ClientNotesSubsectionProps = {
  client: HubClientNode;
  organizationId: Id<"organizations">;
  memberUserKey: string;
};

export function ClientNotesSubsection({
  client,
  organizationId,
  memberUserKey,
}: ClientNotesSubsectionProps) {
  const [notesExpanded, setNotesExpanded] = useState(() =>
    loadHubClientNotesExpanded(client.clientId),
  );

  const fileOptions = useMemo(
    () => collectClientHubFileOptions(client),
    [client],
  );

  const pipelineFileIds = useMemo(
    () => fileOptions.map((o) => o.fileId),
    [fileOptions],
  );

  const onExpandedChange = useCallback((expanded: boolean) => {
    setNotesExpanded(expanded);
  }, []);

  return (
    <HubCollapsibleSubsection
      title="Client notes"
      icon={StickyNote}
      clientId={client.clientId}
      expanded={notesExpanded}
      onExpandedChange={onExpandedChange}
      className="mx-2 mb-2"
      data-testid="pipeline-hub-client-notes-subsection"
    >
      <div className="space-y-4">
        <ClientScopedNoteComposer
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          fileOptions={fileOptions}
        />
        <ClientNotesTimeline
          pipelineFileIds={pipelineFileIds}
          organizationId={organizationId}
          memberUserKey={memberUserKey}
          enabled={notesExpanded}
        />
      </div>
    </HubCollapsibleSubsection>
  );
}
