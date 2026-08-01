import type { Doc, Id } from "./_generated/dataModel";

export type LenderBoardRole = "primary" | "secondary" | "considering";

export type LenderBoardState = {
  primaryLenderId: Id<"lenders"> | undefined;
  secondaryLenderIds: Id<"lenders">[];
  consideringLenderIds: Id<"lenders">[];
};

/** Read the three lender-board buckets; migrates legacy `lenders` / role fields. */
export function resolvePipelineLenderBoard(row: Doc<"pipeline">): LenderBoardState {
  const primary =
    row.primaryLenderId ?? row.selectedLenderId ?? undefined;
  const secondaryRaw =
    row.secondaryLenderIds ??
    row.supportingLenderIds ??
    [];
  const secondary = [...new Set(secondaryRaw)].filter(
    (id) => !primary || id !== primary,
  );

  const consideringRaw = row.consideringLenderIds;
  let considering: Id<"lenders">[];
  if (consideringRaw && consideringRaw.length > 0) {
    considering = [...new Set(consideringRaw)].filter(
      (id) =>
        (!primary || id !== primary) && !secondary.includes(id),
    );
  } else {
    considering = (row.lenders ?? []).filter(
      (id) =>
        (!primary || id !== primary) && !secondary.includes(id),
    );
  }

  return {
    primaryLenderId: primary,
    secondaryLenderIds: secondary,
    consideringLenderIds: considering,
  };
}

/** @deprecated Use `resolvePipelineLenderBoard`. */
export function resolvePipelineLenderRoles(row: Doc<"pipeline">): {
  primaryLenderId: Id<"lenders"> | undefined;
  supportingLenderIds: Id<"lenders">[];
} {
  const board = resolvePipelineLenderBoard(row);
  return {
    primaryLenderId: board.primaryLenderId,
    supportingLenderIds: board.secondaryLenderIds,
  };
}

export function lenderBoardRoleForId(
  board: LenderBoardState,
  lenderId: Id<"lenders">,
): LenderBoardRole | null {
  if (board.primaryLenderId === lenderId) return "primary";
  if (board.secondaryLenderIds.includes(lenderId)) return "secondary";
  if (board.consideringLenderIds.includes(lenderId)) return "considering";
  return null;
}

export function isLenderOnFileBoard(
  board: LenderBoardState,
  lenderId: Id<"lenders">,
): boolean {
  return lenderBoardRoleForId(board, lenderId) != null;
}

/** Canonical write shape — keeps legacy `lenders` + `selectedLenderId` in sync. */
export function buildPipelineLenderBoardFields(
  primaryLenderId: Id<"lenders"> | undefined,
  secondaryLenderIds: Id<"lenders">[],
  consideringLenderIds: Id<"lenders">[],
): {
  primaryLenderId: Id<"lenders"> | undefined;
  secondaryLenderIds: Id<"lenders">[];
  consideringLenderIds: Id<"lenders">[];
  supportingLenderIds: Id<"lenders">[];
  lenders: Id<"lenders">[];
  selectedLenderId: Id<"lenders"> | undefined;
} {
  const secondary = [...new Set(secondaryLenderIds)].filter(
    (id) => !primaryLenderId || id !== primaryLenderId,
  );
  const considering = [...new Set(consideringLenderIds)].filter(
    (id) =>
      (!primaryLenderId || id !== primaryLenderId) &&
      !secondary.includes(id),
  );
  const lenders = primaryLenderId
    ? [primaryLenderId, ...secondary, ...considering]
    : [...secondary, ...considering];
  return {
    primaryLenderId,
    secondaryLenderIds: secondary,
    consideringLenderIds: considering,
    supportingLenderIds: secondary,
    lenders,
    selectedLenderId: primaryLenderId,
  };
}

/** @deprecated Use `buildPipelineLenderBoardFields`. */
export function buildPipelineLenderRoleFields(
  primaryLenderId: Id<"lenders"> | undefined,
  supportingLenderIds: Id<"lenders">[],
): ReturnType<typeof buildPipelineLenderBoardFields> {
  return buildPipelineLenderBoardFields(
    primaryLenderId,
    supportingLenderIds,
    [],
  );
}

/** Move a lender into exactly one board role; demotes displaced primary to considering. */
export function assignLenderBoardRole(
  board: LenderBoardState,
  lenderId: Id<"lenders">,
  role: LenderBoardRole,
): ReturnType<typeof buildPipelineLenderBoardFields> {
  let { primaryLenderId, secondaryLenderIds, consideringLenderIds } = board;
  const prevPrimary = primaryLenderId;

  if (primaryLenderId === lenderId) primaryLenderId = undefined;
  secondaryLenderIds = secondaryLenderIds.filter((id) => id !== lenderId);
  consideringLenderIds = consideringLenderIds.filter((id) => id !== lenderId);

  if (role === "primary") {
    if (prevPrimary && prevPrimary !== lenderId) {
      consideringLenderIds = [
        prevPrimary,
        ...consideringLenderIds.filter((id) => id !== prevPrimary),
      ];
    }
    primaryLenderId = lenderId;
  } else if (role === "secondary") {
    secondaryLenderIds = [...secondaryLenderIds, lenderId];
  } else {
    consideringLenderIds = [...consideringLenderIds, lenderId];
  }

  return buildPipelineLenderBoardFields(
    primaryLenderId,
    secondaryLenderIds,
    consideringLenderIds,
  );
}

/** Remove a lender from every board bucket. */
export function removeLenderFromBoard(
  board: LenderBoardState,
  lenderId: Id<"lenders">,
): ReturnType<typeof buildPipelineLenderBoardFields> {
  let { primaryLenderId, secondaryLenderIds, consideringLenderIds } = board;
  if (primaryLenderId === lenderId) primaryLenderId = undefined;
  secondaryLenderIds = secondaryLenderIds.filter((id) => id !== lenderId);
  consideringLenderIds = consideringLenderIds.filter((id) => id !== lenderId);
  return buildPipelineLenderBoardFields(
    primaryLenderId,
    secondaryLenderIds,
    consideringLenderIds,
  );
}

export function allLenderIdsOnFile(row: Doc<"pipeline">): Id<"lenders">[] {
  const board = resolvePipelineLenderBoard(row);
  return buildPipelineLenderBoardFields(
    board.primaryLenderId,
    board.secondaryLenderIds,
    board.consideringLenderIds,
  ).lenders;
}
