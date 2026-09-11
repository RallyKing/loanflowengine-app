"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";

type Props = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  fileId: Id<"pipeline">;
  projectId?: Id<"projects">;
  readOnly?: boolean;
};

export function ChangeFileProjectControl({
  organizationId,
  memberUserKey,
  fileId,
  projectId,
  readOnly,
}: Props) {
  const reassignStatus = useQuery(
    api.hierarchyCrudMutations.getPipelineFileReassignStatus,
    {
      organizationId,
      memberUserKey,
      fileId,
    },
  );
  const projects = useQuery(
    api.hierarchyCrudMutations.listProjects,
    reassignStatus?.canDeleteOrReassign
      ? { organizationId, memberUserKey }
      : "skip",
  );
  const changePipelineProject = useMutation(
    api.hierarchyCrudMutations.changePipelineProject,
  );

  const [selectedProjectId, setSelectedProjectId] = useState(
    projectId ? String(projectId) : "",
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readOnly || !reassignStatus?.canDeleteOrReassign || !projects?.length) {
    return null;
  }

  const current = projectId ? String(projectId) : "";
  const changed = selectedProjectId && selectedProjectId !== current;

  const onConfirm = async () => {
    if (!selectedProjectId) return;
    setError(null);
    setBusy(true);
    try {
      await changePipelineProject({
        organizationId,
        memberUserKey,
        fileId,
        newProjectId: selectedProjectId as Id<"projects">,
      });
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="w-full min-w-0 rounded-dlc-md border border-border/70 bg-muted/20 p-2"
      data-testid="change-file-project"
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Project assignment
      </p>
      <select
        className="h-9 w-full min-w-0 rounded-dlc-md border border-border bg-background px-2 text-sm max-md:min-h-11"
        value={selectedProjectId}
        onChange={(e) => setSelectedProjectId(e.target.value)}
        disabled={busy}
        aria-label="Change project"
      >
        <option value="">Select project…</option>
        {projects.map((p: { _id: Id<"projects">; title: string }) => (
          <option key={p._id} value={p._id}>
            {p.title}
          </option>
        ))}
      </select>
      {changed ? (
        confirm ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Move this loan file to a different project? Primary client and graph
              edges will update to match the new project.
            </p>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                {busy ? "Moving…" : "Confirm change project"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setConfirm(true)}
          >
            Change project
          </Button>
        )
      ) : null}
    </div>
  );
}
