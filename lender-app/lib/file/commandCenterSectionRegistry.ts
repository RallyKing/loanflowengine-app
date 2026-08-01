import type { MutableRefObject } from "react";
import type {
  CommandCenterSectionRenderer,
  DealInfoCommandCenterSectionId,
} from "@/lib/file/dealInfoCommandCenterLayout";

export type SectionRegistrySlice = Partial<
  Record<DealInfoCommandCenterSectionId, CommandCenterSectionRenderer>
>;

export type RegisterCommandCenterSections = (
  sections: SectionRegistrySlice,
  contentSig?: string,
) => void;

/** Stable key signature for a registry slice (section ids only). */
export function sectionRegistrySliceKeys(
  sections: SectionRegistrySlice,
): string {
  return Object.keys(sections).sort().join(",");
}

/** Update a registry ref; return true when generation should bump. */
export function commitSectionRegistrySlice(
  ref: MutableRefObject<SectionRegistrySlice>,
  sigRef: MutableRefObject<string>,
  sections: SectionRegistrySlice,
  contentSig = "",
): boolean {
  ref.current = sections;
  const sig = `${sectionRegistrySliceKeys(sections)}|${contentSig}`;
  if (sigRef.current === sig) return false;
  sigRef.current = sig;
  return true;
}

/** Refresh renderer closures without bumping registry generation (data-only updates). */
export function refreshSectionRegistrySlice(
  ref: MutableRefObject<SectionRegistrySlice>,
  sections: SectionRegistrySlice,
): void {
  ref.current = sections;
}

/** Collect registered section ids from all registry slices. */
export function registeredCommandCenterSectionIds(
  slices: readonly SectionRegistrySlice[],
  extraIds: readonly DealInfoCommandCenterSectionId[] = [],
): Set<DealInfoCommandCenterSectionId> {
  const ids = new Set<DealInfoCommandCenterSectionId>();
  for (const slice of slices) {
    for (const id of Object.keys(slice) as DealInfoCommandCenterSectionId[]) {
      ids.add(id);
    }
  }
  for (const id of extraIds) {
    ids.add(id);
  }
  return ids;
}

export function resolveCommandCenterSectionRenderer(
  id: DealInfoCommandCenterSectionId,
  slices: readonly SectionRegistrySlice[],
): CommandCenterSectionRenderer | undefined {
  for (const slice of slices) {
    const renderer = slice[id];
    if (renderer) return renderer;
  }
  return undefined;
}
