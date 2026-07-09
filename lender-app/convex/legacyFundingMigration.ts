import { internalMutation } from "./_generated/server";

/**
 * Deep-migrate legacy money and type fields into canonical names: `loanAmount` →
 * `fundingAmount`, `loanType` / `loanTypeLabel` / `loanTypeKeywords` →
 * `fundingType` / `fundingTypeLabel` / `fundingTypeKeywords` when the target is empty,
 * then remove legacy keys. Same walk for nested objects/arrays.
 *
 * Run once after deploy:
 *   `npx convex run internal.legacyFundingMigration:migrateAll`
 */
function migrateDeep(v: unknown): unknown {
  if (v == null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((item) => migrateDeep(item));
  const o: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const key of Object.keys(o)) {
    o[key] = migrateDeep(o[key]);
  }
  if ("loanAmount" in o) {
    const lm = o.loanAmount;
    const fm = o.fundingAmount;
    const lmStr = lm == null ? "" : String(lm).trim();
    const fmStr = fm == null ? "" : String(fm).trim();
    if (lmStr !== "" && fmStr === "") {
      o.fundingAmount = typeof lm === "number" ? String(lm) : lm;
    }
    delete o.loanAmount;
  }
  if ("loanTypeLabel" in o) {
    const ltl = o.loanTypeLabel;
    if (ltl != null && String(ltl).trim() !== "") {
      if (
        o.fundingTypeLabel == null ||
        String(o.fundingTypeLabel).trim() === ""
      ) {
        o.fundingTypeLabel = ltl;
      }
    }
    delete o.loanTypeLabel;
  }
  if ("loanTypeKeywords" in o && Array.isArray(o.loanTypeKeywords)) {
    const fk = o.fundingTypeKeywords;
    if (!Array.isArray(fk) || fk.length === 0) {
      o.fundingTypeKeywords = o.loanTypeKeywords;
    }
    delete o.loanTypeKeywords;
  }
  if ("loanType" in o) {
    const lt = o.loanType;
    const ft = o.fundingType;
    const ltStr = lt == null ? "" : String(lt).trim();
    const ftStr = ft == null ? "" : String(ft).trim();
    if (ltStr !== "" && ftStr === "") {
      o.fundingType = lt;
    }
    delete o.loanType;
  }
  return o;
}

function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export const migrateAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let intakeSheets = 0;
    for (const row of await ctx.db.query("intakeSheets").collect()) {
      const patch: Record<string, unknown> = {};
      if (row.cover != null) {
        const next = migrateDeep(row.cover);
        if (changed(row.cover, next)) patch.cover = next;
      }
      if (row.dti != null) {
        const next = migrateDeep(row.dti);
        if (changed(row.dti, next)) patch.dti = next;
      }
      if (row.comparison != null) {
        const next = migrateDeep(row.comparison);
        if (changed(row.comparison, next)) patch.comparison = next;
      }
      if (Array.isArray(row.loans) && row.loans.length > 0) {
        const next = row.loans.map((L) => migrateDeep(L));
        if (changed(row.loans, next)) patch.loans = next;
      }
      if (row.scenario != null) {
        const next = migrateDeep(row.scenario);
        if (changed(row.scenario, next)) patch.scenario = next;
      }
      for (const key of ["comparisonInstances", "dtiInstances"] as const) {
        const arr = row[key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const next = arr.map((item: unknown) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return migrateDeep(item);
          }
          const it = item as Record<string, unknown>;
          if (it.data != null) {
            return { ...it, data: migrateDeep(it.data) };
          }
          return migrateDeep(item);
        });
        if (changed(arr, next)) patch[key] = next;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch as Record<string, never>);
        intakeSheets++;
      }
    }

    let pipelines = 0;
    for (const row of await ctx.db.query("pipeline").collect()) {
      const patch: Record<string, unknown> = {};
      const r = row as Record<string, unknown>;
      if ("loanAmount" in r && r.loanAmount !== undefined) {
        const la = r.loanAmount as number;
        const fa = r.fundingAmount as number | undefined;
        if (fa === undefined || !Number.isFinite(fa)) {
          patch.fundingAmount =
            typeof la === "number" && Number.isFinite(la) ? la : 0;
        }
      }
      if (r.dealData != null && typeof r.dealData === "object") {
        const nextDeal = migrateDeep(r.dealData);
        if (changed(r.dealData, nextDeal)) {
          patch.dealData = nextDeal;
        }
      }
      if (r.scenarioCriteria != null && typeof r.scenarioCriteria === "object") {
        const nextCrit = migrateDeep(r.scenarioCriteria);
        if (changed(r.scenarioCriteria, nextCrit)) {
          patch.scenarioCriteria = nextCrit;
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch as Record<string, never>);
        pipelines++;
      }
    }

    let lenders = 0;
    for (const row of await ctx.db.query("lenders").collect()) {
      const r = row as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (r.loanAmountMin != null && String(r.loanAmountMin).trim() !== "") {
        if (!r.fundingAmountMin || String(r.fundingAmountMin).trim() === "") {
          patch.fundingAmountMin = r.loanAmountMin;
        }
      }
      if (r.loanAmountMax != null && String(r.loanAmountMax).trim() !== "") {
        if (!r.fundingAmountMax || String(r.fundingAmountMax).trim() === "") {
          patch.fundingAmountMax = r.loanAmountMax;
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch as Record<string, never>);
        lenders++;
      }
    }

    return { intakeSheets, pipelines, lenders };
  },
});
