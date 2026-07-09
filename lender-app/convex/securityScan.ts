import { internalMutation } from "./_generated/server";

const FAIL_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_FAIL_ANOMALY_THRESHOLD = 14;

/**
 * Scans recent `portal_password_fail` events and records a single anomaly row
 * per org+subject per hour when failures exceed the threshold.
 */
export const scanPortalAuthAnomalies = internalMutation({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - FAIL_WINDOW_MS;
    const rows = await ctx.db
      .query("securityAuditLog")
      .withIndex("by_kind_at", (q) =>
        q.eq("kind", "portal_password_fail").gte("at", since),
      )
      .collect();

    const counts = new Map<
      string,
      { orgScope?: string; subjectKey?: string; n: number }
    >();
    for (const r of rows) {
      const subj = r.subjectKey ?? "";
      const org = r.orgScope ?? "";
      const k = `${org}|${subj}`;
      const cur = counts.get(k) ?? {
        orgScope: r.orgScope,
        subjectKey: r.subjectKey,
        n: 0,
      };
      cur.n++;
      counts.set(k, cur);
    }

    const existingAnomalies = await ctx.db
      .query("securityAuditLog")
      .withIndex("by_kind_at", (q) =>
        q.eq("kind", "portal_bruteforce_anomaly").gte("at", since),
      )
      .collect();
    const alreadyReported = new Set<string>();
    for (const e of existingAnomalies) {
      alreadyReported.add(`${e.orgScope ?? ""}|${e.subjectKey ?? ""}`);
    }

    for (const [sig, v] of counts) {
      if (v.n < PASSWORD_FAIL_ANOMALY_THRESHOLD) continue;
      if (alreadyReported.has(sig)) continue;
      await ctx.db.insert("securityAuditLog", {
        at: Date.now(),
        kind: "portal_bruteforce_anomaly",
        orgScope: v.orgScope,
        subjectKey: v.subjectKey,
        detail: `password_failures=${v.n} in ${FAIL_WINDOW_MS / 60000}m`,
      });
      alreadyReported.add(sig);
    }

    return { ok: true as const };
  },
});
