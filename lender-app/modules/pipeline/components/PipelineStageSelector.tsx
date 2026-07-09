"use client";

import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineSelect } from "@/components/inline";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  formatPipelineStageCompactLabel,
  useOrganizationPipelineStages,
} from "@/hooks/useOrganizationPipelineStages";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";

type Props = {
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  readOnly?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  onCommit: (next: {
    stageId: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
  }) => void;
};

export function PipelineStageSelector({
  stageId,
  subStageId,
  readOnly = false,
  compact = false,
  ariaLabel = "Pipeline stage",
  onCommit,
}: Props) {
  const {
    tree,
    stageById,
    subById,
    loading,
    canManageStageArchitecture,
    canAssignStages,
  } = useOrganizationPipelineStages();
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const createSubStage = useMutation(api.organizationPipelineStages.createSubStage);

  const [creatingSub, setCreatingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const currentStage = stageId ? stageById.get(stageId) : tree[0]?.stage;
  const currentSub = subStageId ? subById.get(subStageId) : undefined;

  const parentOptions = useMemo(
    () =>
      tree.map(({ stage }) => ({
        value: String(stage._id),
        label: stage.name,
        badgeStyle: {
          backgroundColor: `${stage.color}22`,
          borderColor: stage.color,
          color: "#111827",
        },
      })),
    [tree],
  );

  const subOptions = useMemo(() => {
    const pid = currentStage?._id;
    if (!pid) return [];
    const node = tree.find((t) => t.stage._id === pid);
    return (node?.subStages ?? []).map((sub) => ({
      value: String(sub._id),
      label: sub.name,
      badgeStyle: {
        backgroundColor: `${sub.color}22`,
        borderColor: sub.color,
        color: "#111827",
      },
    }));
  }, [currentStage?._id, tree]);

  const displayLabel = formatPipelineStageCompactLabel(currentStage, currentSub);
  const disabled = readOnly || !canAssignStages || loading;

  if (disabled && !loading) {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 font-medium",
          compact ? "text-[11px]" : "text-xs",
        )}
        style={
          currentStage
            ? {
                backgroundColor: `${currentStage.color}22`,
                borderColor: currentStage.color,
              }
            : undefined
        }
        title={displayLabel}
      >
        <span className="truncate">{displayLabel}</span>
      </span>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", compact && "gap-1")}>
      <InlineSelect
        value={currentStage ? String(currentStage._id) : ""}
        options={parentOptions}
        ariaLabel={`${ariaLabel} — parent`}
        asBadge
        onCommit={(next) => {
          onCommit({
            stageId: next as Id<"organizationPipelineStages">,
            subStageId: undefined,
          });
        }}
      />
      {currentStage && subOptions.length > 0 && (
        <InlineSelect
          value={currentSub ? String(currentSub._id) : ""}
          options={[{ value: "", label: "No sub-stage" }, ...subOptions]}
          ariaLabel={`${ariaLabel} — sub-stage`}
          asBadge
          onCommit={(next) => {
            if (!currentStage) return;
            onCommit({
              stageId: currentStage._id,
              subStageId: next
                ? (next as Id<"organizationPipelineSubStages">)
                : undefined,
            });
          }}
        />
      )}
      {canManageStageArchitecture && currentStage && !creatingSub && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setCreatingSub(true)}
        >
          + Sub
        </Button>
      )}
      {creatingSub && currentStage && activeOrganizationId && (
        <div className="flex min-w-0 items-center gap-1">
          <Input
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            placeholder="Sub-stage name"
            className="h-8 min-w-[8rem] text-xs"
            aria-label="New sub-stage name"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0"
            disabled={!newSubName.trim()}
            onClick={() => {
              const name = newSubName.trim();
              if (!name) return;
              void createSubStage({
                organizationId: activeOrganizationId,
                memberUserKey,
                parentStageId: currentStage._id,
                name,
              }).then((res) => {
                setCreatingSub(false);
                setNewSubName("");
                onCommit({ stageId: currentStage._id, subStageId: res.id });
              });
            }}
          >
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setCreatingSub(false);
              setNewSubName("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
