/**
 * Pure partition for Manage Templates / Apply Template library lists.
 *
 * Individual = full org task-template library (including stack members).
 * Stacks = packs that reference the same template rows via `stackId`.
 *
 * Orphans (dangling `stackId` whose stack no longer exists) appear only in
 * Individual so they remain editable/injectable.
 */

export type TemplateStackLike = {
  _id: string;
  sortOrder: number;
};

export type TemplateLike = {
  _id: string;
  stackId?: string;
  sortOrder: number;
};

export type PartitionedTemplateLibrary<
  S extends TemplateStackLike,
  T extends TemplateLike,
> = {
  stacks: Array<S & { templates: T[] }>;
  individualTemplates: T[];
};

export function partitionDocumentTaskTemplates<
  S extends TemplateStackLike,
  T extends TemplateLike,
>(
  stacks: S[],
  templates: T[],
): PartitionedTemplateLibrary<S, T> {
  const liveStackIds = new Set(stacks.map((s) => String(s._id)));
  const byStack = new Map<string, T[]>();

  for (const tpl of templates) {
    const stackId = tpl.stackId ? String(tpl.stackId) : "";
    if (!stackId || !liveStackIds.has(stackId)) continue;
    const list = byStack.get(stackId);
    if (list) list.push(tpl);
    else byStack.set(stackId, [tpl]);
  }

  const sortedStacks = [...stacks].sort((a, b) => a.sortOrder - b.sortOrder);
  const out = sortedStacks.map((stack) => {
    const members = [...(byStack.get(String(stack._id)) ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return { ...stack, templates: members };
  });

  const individualTemplates = [...templates].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return { stacks: out, individualTemplates };
}

/** Resolve stack display name for an Individual-list row. */
export function templateStackLabel(
  stackId: string | undefined,
  stacks: Array<{ _id: string; name: string }>,
): string | null {
  if (!stackId) return null;
  const hit = stacks.find((s) => String(s._id) === String(stackId));
  return hit?.name ?? "Orphaned stack";
}

/**
 * Apply Template → Individual Tasks ordering:
 * favorites first, then non-favorites; stable secondary sort by title.
 * Does not change inject semantics — display order only.
 */
export function sortIndividualTemplatesByFavorites<
  T extends { _id: string; title: string },
>(templates: T[], favoriteIds: ReadonlySet<string>): T[] {
  return [...templates].sort((a, b) => {
    const aFav = favoriteIds.has(String(a._id));
    const bFav = favoriteIds.has(String(b._id));
    if (aFav !== bFav) return aFav ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}
