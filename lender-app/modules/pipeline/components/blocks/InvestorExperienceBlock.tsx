"use client";

/**
 * Phase Modular-C — `investorExperience` block. Sticky investor track record
 * for the file's primary borrower contact (`contactInvestorProjects`), with a
 * 36-month recency window filter so lender-required experience is one glance.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";

type InvestorProject = Doc<"contactInvestorProjects">;

const WINDOW_36_MONTHS_MS = 36 * 30.44 * 24 * 60 * 60 * 1000;

/** Parse loose date strings (`2024-05`, `05/2024`, `May 2024`, full dates). */
function parseLooseDateMs(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? t : null;
}

function projectWithin36Months(row: InvestorProject, now: number): boolean {
  const anchor =
    parseLooseDateMs(row.saleDate) ??
    parseLooseDateMs(row.purchaseDate) ??
    row.updatedAt;
  return now - anchor <= WINDOW_36_MONTHS_MS;
}

export type InvestorExperienceBlockProps = {
  /** Primary borrower contact — sticky data owner. Null → guidance message. */
  contactId: Id<"contacts"> | null;
  memberUserKey?: string;
  readOnly?: boolean;
};

const EMPTY_DRAFT = {
  address: "",
  projectType: "",
  role: "",
  purchaseAmount: "",
  purchaseDate: "",
  saleAmount: "",
  saleDate: "",
  outcome: "",
};

export function InvestorExperienceBlock({
  contactId,
  memberUserKey,
  readOnly = false,
}: InvestorExperienceBlockProps) {
  const projects = useQuery(
    api.contactInvestorProjects.listByContact,
    contactId
      ? { contactId, ...(memberUserKey ? { memberUserKey } : {}) }
      : "skip",
  );
  const upsertProject = useMutation(api.contactInvestorProjects.upsertProject);
  const archiveProject = useMutation(
    api.contactInvestorProjects.archiveProject,
  );

  const [windowFilter, setWindowFilter] = useState<"36m" | "all">("36m");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const visibleProjects = useMemo(() => {
    const rows = projects ?? [];
    if (windowFilter === "all") return rows;
    return rows.filter((r) => projectWithin36Months(r, now));
  }, [projects, windowFilter, now]);

  const recentCount = useMemo(
    () => (projects ?? []).filter((r) => projectWithin36Months(r, now)).length,
    [projects, now],
  );

  const meta = useMemo(() => {
    const total = projects?.length ?? 0;
    return {
      status: total > 0 ? "Configured" : "Draft",
      summary:
        total > 0
          ? `${total} project(s) · ${recentCount} in last 36 months`
          : "Borrower track record travels across files",
      indicatorCount: total > 0 ? total : undefined,
    };
  }, [projects, recentCount]);

  const addProject = async () => {
    if (!contactId) return;
    const hasContent = Object.values(draft).some((val) => val.trim() !== "");
    if (!hasContent) {
      setError("Add at least one field before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertProject({
        contactId,
        address: draft.address.trim() || undefined,
        projectType: draft.projectType.trim() || undefined,
        role: draft.role.trim() || undefined,
        purchaseAmount: draft.purchaseAmount.trim() || undefined,
        purchaseDate: draft.purchaseDate.trim() || undefined,
        saleAmount: draft.saleAmount.trim() || undefined,
        saleDate: draft.saleDate.trim() || undefined,
        outcome: draft.outcome.trim() || undefined,
        ...(memberUserKey ? { memberUserKey } : {}),
      });
      setDraft(EMPTY_DRAFT);
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.investorExperience}
      title="Investor experience"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<Building2 className="h-4 w-4" aria-hidden />}
      description="Sticky track record on the primary borrower's contact — projects added here follow the borrower to every file."
      lazyMount
      animated
      contentClassName="space-y-4"
    >
      {!contactId ? (
        <p className="text-sm text-muted-foreground">
          Link a primary borrower contact to this file to track investor
          experience.
        </p>
      ) : projects === undefined ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading track record…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-dlc-sm border border-border bg-background p-0.5 shadow-dlc-1"
              role="group"
              aria-label="Track record window"
            >
              {(
                [
                  { key: "36m", label: "Last 36 months" },
                  { key: "all", label: "All projects" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={windowFilter === opt.key}
                  className={cn(
                    "min-h-8 rounded-dlc-sm px-2.5 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                    windowFilter === opt.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setWindowFilter(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setShowAdd((s) => !s)}
                data-testid="investor-experience-toggle-add"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add project
              </Button>
            ) : null}
          </div>

          {visibleProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {windowFilter === "36m" && (projects.length ?? 0) > 0
                ? "No projects in the last 36 months. Switch to “All projects” to see the full history."
                : "No investor projects recorded yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm"
                data-testid="investor-experience-table"
              >
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="border-b border-border/70 px-2 py-1.5">Address</th>
                    <th className="border-b border-border/70 px-2 py-1.5">Type</th>
                    <th className="border-b border-border/70 px-2 py-1.5">Role</th>
                    <th className="border-b border-border/70 px-2 py-1.5 text-right">Purchase</th>
                    <th className="border-b border-border/70 px-2 py-1.5">Purchased</th>
                    <th className="border-b border-border/70 px-2 py-1.5 text-right">Sale</th>
                    <th className="border-b border-border/70 px-2 py-1.5">Sold</th>
                    <th className="border-b border-border/70 px-2 py-1.5">Outcome</th>
                    {!readOnly ? (
                      <th className="border-b border-border/70 px-2 py-1.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map((row) => (
                    <tr key={row._id} className="align-middle">
                      <td className="border-b border-border/40 px-2 py-1.5 font-medium text-foreground">
                        {row.address || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {row.projectType || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {row.role || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5 text-right tabular-nums">
                        {row.purchaseAmount || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {row.purchaseDate || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5 text-right tabular-nums">
                        {row.saleAmount || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {row.saleDate || "—"}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {row.outcome || "—"}
                      </td>
                      {!readOnly ? (
                        <td className="border-b border-border/40 px-2 py-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label="Archive investor project"
                            onClick={() =>
                              void archiveProject({
                                contactId,
                                projectId: row._id,
                                ...(memberUserKey ? { memberUserKey } : {}),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!readOnly && showAdd ? (
            <div className="space-y-2 rounded-dlc-md border border-border/60 bg-dlc-surface-high/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Add investor project
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  value={draft.address}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, address: e.target.value }))
                  }
                  placeholder="Property address"
                  aria-label="Project address"
                />
                <Input
                  value={draft.projectType}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, projectType: e.target.value }))
                  }
                  placeholder="Type (flip, ground-up…)"
                  aria-label="Project type"
                />
                <Input
                  value={draft.role}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, role: e.target.value }))
                  }
                  placeholder="Role (GC, sponsor…)"
                  aria-label="Project role"
                />
                <Input
                  value={draft.outcome}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, outcome: e.target.value }))
                  }
                  placeholder="Outcome (sold, refi…)"
                  aria-label="Project outcome"
                />
                <Input
                  value={draft.purchaseAmount}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, purchaseAmount: e.target.value }))
                  }
                  placeholder="Purchase $"
                  inputMode="decimal"
                  aria-label="Purchase amount"
                />
                <Input
                  value={draft.purchaseDate}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, purchaseDate: e.target.value }))
                  }
                  placeholder="Purchase date"
                  aria-label="Purchase date"
                />
                <Input
                  value={draft.saleAmount}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, saleAmount: e.target.value }))
                  }
                  placeholder="Sale $"
                  inputMode="decimal"
                  aria-label="Sale amount"
                />
                <Input
                  value={draft.saleDate}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, saleDate: e.target.value }))
                  }
                  placeholder="Sale date"
                  aria-label="Sale date"
                />
              </div>
              {error ? (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void addProject()}
                  data-testid="investor-experience-save-project"
                >
                  {saving ? "Saving…" : "Save project"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAdd(false);
                    setDraft(EMPTY_DRAFT);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </CollapsibleBlock>
  );
}

export default InvestorExperienceBlock;
