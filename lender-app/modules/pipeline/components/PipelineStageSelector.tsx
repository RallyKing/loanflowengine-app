"use client";

import { useEffect, useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineSelect } from "@/components/inline";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  formatPipelineStageCompactLabel,
  useOrganizationPipelineStages,
} from "@/hooks/useOrganizationPipelineStages";
import {
  buildParentStageOptions,
  resolvePipelineRowStage,
} from "@/lib/pipeline/resolvePipelineRowStage";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";

const repairedStageLinkOrgs = new Set<string>();

type Props = {
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  /** Legacy/custom status string — used to resolve stage when `stageId` is missing. */
  status?: string;
  readOnly?: boolean;
  /** When true, allow stage changes for users editing this file (even without org-wide `files.edit`). */
  canEditFile?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  stopPropagation?: boolean;
  onCommit: (next: {
    stageId: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
  }) => void;
};

export function PipelineStageSelector({
  stageId,
  subStageId,
  status,
  readOnly = false,
  canEditFile = false,
  compact = false,
  ariaLabel = "Pipeline stage",
  stopPropagation = false,
  onCommit,
}: Props) {
  const stageIndex = useOrganizationPipelineStages();
  const {
    tree,
    subById,
    loading,
    canManageStageArchitecture,
    canAssignStages,
  } = stageIndex;
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const createSubStage = useMutation(api.organizationPipelineStages.createSubStage);
  const repairLinks = useMutation(
    api.organizationPipelineStages.repairPipelineStageLinks,
  );

  const [creatingSub, setCreatingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const resolved = useMemo(
    () =>
      resolvePipelineRowStage({ stageId, subStageId, status }, stageIndex),
    [stageId, subStageId, status, stageIndex],
  );

  const currentStage = resolved.stage;
  const currentSub = resolved.subStageId
    ? subById.get(resolved.subStageId)
    : resolved.subStage;

  const mayAssign = canAssignStages || canEditFile;
  const disabled = readOnly || !mayAssign || loading;

  useEffect(() => {
    if (!activeOrganizationId || !memberUserKey.trim()) return;
    if (!resolved.inferredFromStatus) return;
    if (!mayAssign) return;
    const orgKey = String(activeOrganizationId);
    if (repairedStageLinkOrgs.has(orgKey)) return;
    repairedStageLinkOrgs.add(orgKey);
    void repairLinks({
      organizationId: activeOrganizationId,
      memberUserKey,
    }).catch(() => {
      repairedStageLinkOrgs.delete(orgKey);
    });
  }, [
    activeOrganizationId,
    memberUserKey,
    mayAssign,
    repairLinks,
    resolved.inferredFromStatus,
  ]);

  const parentOptions = useMemo(
    () => buildParentStageOptions(stageIndex, currentStage),
    [stageIndex, currentStage],
  );

  const subOptions = useMemo(() => {
    const pid = currentStage?._id;
    if (!pid) return [];
    const node = tree.find((t) => t.stage._id === pid);
    const subs = node?.subStages ?? [];
    const opts = subs.map((sub) => ({
      value: String(sub._id),
      label: sub.name,
      badgeStyle: {
        backgroundColor: `${sub.color}22`,
        borderColor: sub.color,
        color: "#111827",
      },
    }));
    if (
      currentSub &&
      !opts.some((o) => o.value === String(currentSub._id))
    ) {
      opts.unshift({
        value: String(currentSub._id),
        label: currentSub.isArchived
          ? `${currentSub.name} (archived)`
          : currentSub.name,
        badgeStyle: {
          backgroundColor: `${currentSub.color}22`,
          borderColor: currentSub.color,
          color: "#111827",
        },
      });
    }
    return opts;
  }, [currentStage?._id, currentSub, tree]);

  const displayLabel = formatPipelineStageCompactLabel(currentStage, currentSub);

  if (disabled && !loading) {
    return (
      <span
        className={cn(
          "inline-flex max-w-full cursor-default items-center rounded-full border px-2.5 py-0.5 font-medium opacity-70",
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
        title={
          readOnly || !mayAssign
            ? `${displayLabel} (view only)`
            : displayLabel
        }
        aria-label={`${ariaLabel}: ${displayLabel}`}
      >
        <span className="truncate">{displayLabel}</span>
      </span>
    );
  }

  const selectValue = currentStage ? String(currentStage._id) : "";

  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", compact && "gap-1")}
      data-testid="pipeline-stage-selector"
    >
      <InlineSelect
        value={selectValue}
        options={parentOptions}
        ariaLabel={`${ariaLabel} — parent`}
        asBadge
        readOnly={disabled}
        stopPropagation={stopPropagation}
        onCommit={(next) => {
          if (!next) return;
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
          readOnly={disabled}
          stopPropagation={stopPropagation}
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
      {canManageStageArchitecture && currentStage && !creatingSub && !compact && (
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
      {creatingSub && currentStage && activeOrganizationId && !compact && (
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
