"use client";

import { useMemo } from "react";
import type { Id } from "@/convex/_generated/dataModel";

/** Stable org + member args for Convex `useQuery` (avoids arg identity churn). */
export function useOrgMemberQueryArgs(
  organizationId: Id<"organizations"> | null | undefined,
  memberUserKey: string | undefined,
): { organizationId: Id<"organizations">; memberUserKey: string } | "skip" {
  return useMemo(() => {
    const key = memberUserKey?.trim();
    if (!organizationId || !key) return "skip";
    return { organizationId, memberUserKey: key };
  }, [organizationId, memberUserKey]);
}

/** Stable file-scoped org args for notes, shares, etc. */
export function usePipelineFileOrgQueryArgs(args: {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
}): {
  pipelineFileId: Id<"pipeline">;
  organizationId: Id<"organizations">;
  memberUserKey?: string;
} {
  const { pipelineFileId, organizationId, memberUserKey } = args;
  return useMemo(() => {
    const key = memberUserKey?.trim();
    return {
      pipelineFileId,
      organizationId,
      ...(key ? { memberUserKey: key } : {}),
    };
  }, [pipelineFileId, organizationId, memberUserKey]);
}
