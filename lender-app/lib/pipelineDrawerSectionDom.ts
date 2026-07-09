import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";

/**
 * DOM `id` for pipeline drawer blocks (`scrollIntoView`, hash links, e2e).
 * File details uses the stable `file-details` id; other blocks use `pipeline-drawer-section-*`.
 */
export function pipelineDrawerSectionDomId(
  sid: PipelineDrawerSectionId,
): string {
  return sid === "fileDetails"
    ? "file-details"
    : `pipeline-drawer-section-${sid}`;
}
