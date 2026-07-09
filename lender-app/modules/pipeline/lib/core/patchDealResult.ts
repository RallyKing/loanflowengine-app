export const PATCH_DEAL_CONFLICT_CODE = "CONFLICT_DATA_CHANGED" as const;

export type PatchDealSuccess = { ok: true };

export type PatchDealConflict = {
  ok: false;
  code: typeof PATCH_DEAL_CONFLICT_CODE;
  serverUpdatedAt: number;
};

export type PatchDealResult = PatchDealSuccess | PatchDealConflict;

export function isPatchDealConflictResult(v: unknown): v is PatchDealConflict {
  if (!v || typeof v !== "object") return false;
  const o = v as PatchDealConflict;
  return (
    o.ok === false &&
    o.code === PATCH_DEAL_CONFLICT_CODE &&
    typeof o.serverUpdatedAt === "number"
  );
}
