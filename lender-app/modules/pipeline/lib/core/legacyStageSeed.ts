/**
 * Canonical legacy funnel stages — seed source for org-scoped dynamic stages (Phase 12.1).
 * Keep aligned with `lib/pipelineStatus.ts` PIPELINE_STATUSES.
 */
import { PIPELINE_STATUSES } from "@/lib/pipelineStatus";

export type LegacyStageSeed = {
  slug: string;
  name: string;
  order: number;
  color: string;
  icon: string;
  isDefault: boolean;
};

export const LEGACY_FUNNEL_STAGE_SEEDS: readonly LegacyStageSeed[] =
  PIPELINE_STATUSES.map((s, i) => ({
    slug: s.value,
    name: s.label,
    order: (i + 1) * 10,
    color:
      s.value === "funding"
        ? "#15803D"
        : s.value === "paid_paying"
          ? "#0F766E"
          : "#F59E0B",
    icon:
      s.value === "confirm_interest"
        ? "handshake"
        : s.value === "portal_collecting_docs"
          ? "folder-open"
          : s.value === "initial_review"
            ? "search"
            : s.value === "accepted"
              ? "check-circle"
              : s.value === "underwriting"
                ? "file-text"
                : s.value === "closing"
                  ? "key"
                  : s.value === "funding"
                    ? "banknote"
                    : "circle-check",
    isDefault: s.value === "confirm_interest",
  }));

export function slugifyStageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "stage";
}
