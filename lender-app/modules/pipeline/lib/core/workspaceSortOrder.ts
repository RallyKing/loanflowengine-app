/** Shared compare for client workspace project/file ordering. */
export function compareWorkspaceSortOrder<T extends { workspaceSortOrder?: number; createdAt: number }>(
  a: T,
  b: T,
  labelCompare: (left: T, right: T) => number,
): number {
  const ao = a.workspaceSortOrder;
  const bo = b.workspaceSortOrder;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  const label = labelCompare(a, b);
  if (label !== 0) return label;
  return a.createdAt - b.createdAt;
}
