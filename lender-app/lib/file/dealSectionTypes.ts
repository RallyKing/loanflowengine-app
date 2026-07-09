import type { Doc } from "@/convex/_generated/dataModel";

/** Convex document shape for the deal / intake file workspace. */
export type DealWorkspaceSheet = Doc<"intakeSheets">;

/** Mutates top-level fields on the intake sheet (shared by all file sections). */
export type DealWorkspaceUpdater = <K extends keyof DealWorkspaceSheet>(
  key: K,
  value: DealWorkspaceSheet[K],
) => void;

/**
 * Props passed to every deal workspace section (Cover, DTI, Business tabs, etc.).
 * Import as `SectionProps` from feature modules that re-export for backward compatibility.
 */
export type DealSectionProps = {
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  /** Tighter instance-tool chrome when nested in `DealAnalysisWorkspace`. */
  analysisWorkspaceNested?: boolean;
};
