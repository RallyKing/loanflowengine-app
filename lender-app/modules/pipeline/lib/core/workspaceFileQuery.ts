import type { Id } from "@/convex/_generated/dataModel";
import { isLikelyConvexTableId } from "@/lib/pipeline/hubHierarchyKeys";

/** True when `fileId` is safe to pass to `pipeline:getDetail` and related file queries. */
export function isPipelineFileQueryId(
  fileId: Id<"pipeline"> | string | undefined | null,
): fileId is Id<"pipeline"> {
  if (fileId == null) return false;
  const id = String(fileId).trim();
  if (!id) return false;
  return isLikelyConvexTableId(id);
}
