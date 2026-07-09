"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";
import { cn } from "@/lib/cn";

type ClientSettingsProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  clientId: Id<"clients">;
  displayName: string;
  compact?: boolean;
};

export function ClientHierarchySettings({
  organizationId,
  memberUserKey,
  clientId,
  displayName,
  compact,
}: ClientSettingsProps) {
  const { confirm } = useOperationalConfirm();
  const deleteStatus = useQuery(api.hierarchyCrudMutations.getClientDeleteStatus, {
    organizationId,
    memberUserKey,
    clientId,
  });
  const patchClient = useMutation(api.hierarchyCrudMutations.patchClient);
  const deleteClient = useMutation(api.hierarchyCrudMutations.deleteClient);

  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);

  if (!deleteStatus?.canDeleteOrReassign) return null;

  const projectCount = deleteStatus.projectCount ?? 0;
  const loanFileCount = deleteStatus.loanFileCount ?? 0;
  const hasNested = deleteStatus.hasNestedChildren === true;

  const onSaveName = async () => {
    const next = name.trim();
    if (!next || next === displayName) return;
    setSaving(true);
    try {
      await patchClient({
        organizationId,
        memberUserKey,
        clientId,
        displayName: next,
      });
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = () => {
    void confirm({
      variant: "delete",
      title: "Delete client",
      entityName: displayName,
      impact: "This permanently removes the client and all data grouped under it.",
      preview: {
        relationshipCounts: [
          { label: "Projects", count: projectCount },
          { label: "Loan files", count: loanFileCount },
        ],
      },
      cascade: hasNested
        ? [
            {
              text: `${projectCount} project${projectCount === 1 ? "" : "s"} and ${loanFileCount} loan file${loanFileCount === 1 ? "" : "s"} will be permanently removed.`,
              tone: "attention",
            },
          ]
        : [{ text: "Only this client record is removed." }],
      requireTypedConfirm: hasNested ? "DELETE" : undefined,
      testId: "client-hierarchy-delete-modal",
      onConfirm: async () => {
        const result = await withOperationalTimeout(
          deleteClient({
            organizationId,
            memberUserKey,
            clientId,
            forceCascade: hasNested ? true : undefined,
          }),
          {
            timeoutMs: 25_000,
            message:
              "Delete is taking longer than expected. Check your connection, then try again.",
          },
        );
        if (!result.ok) throw new Error(result.message);
      },
    });
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background/80",
        compact ? "p-2" : "p-3",
      )}
      data-testid="client-hierarchy-settings"
    >
      {!compact ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Client settings
        </p>
      ) : null}
      <label className="mb-2 block text-xs text-muted-foreground">
        Display name
        <Input
          className="mt-1 h-9"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void onSaveName()}
          disabled={saving}
        />
      </label>
      <div
        className="mt-3 rounded-md border border-destructive/15 bg-destructive/[0.03] p-3"
        data-testid="client-delete-zone"
      >
        <p className="text-xs font-medium text-foreground">Delete client</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Permanently remove this client and its grouped projects.
        </p>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={openDeleteConfirm}
        >
          Delete client
        </Button>
      </div>
    </div>
  );
}
