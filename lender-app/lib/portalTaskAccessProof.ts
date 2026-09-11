const STORAGE_PREFIX = "dlc_portal_task_access_proof:";

export function portalTaskAccessProofKey(
  token: string,
  fileTaskId: string,
): string {
  return `${STORAGE_PREFIX}${token.trim()}:${fileTaskId.trim()}`;
}

export function readPortalTaskAccessProof(
  token: string,
  fileTaskId: string,
): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(
      portalTaskAccessProofKey(token, fileTaskId),
    );
    return raw?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function writePortalTaskAccessProof(
  token: string,
  fileTaskId: string,
  proofToken: string,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      portalTaskAccessProofKey(token, fileTaskId),
      proofToken.trim(),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function clearPortalTaskAccessProof(
  token: string,
  fileTaskId: string,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(portalTaskAccessProofKey(token, fileTaskId));
  } catch {
    /* ignore */
  }
}
