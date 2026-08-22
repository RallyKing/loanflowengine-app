"use client";

/**
 * Construction budget block — layout & formulas mirror
 * `Construction Budget Template (1).xlsx` sheet Budget (Rev 06.01.2025).
 * Same pipeline block identity (`constructionBudget`); PFS visual tokens only.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { HardHat, Plus, Trash2 } from "lucide-react";
import { BlockPdfExportButton } from "@/components/library/BlockPdfExportButton";
import { Button } from "@/components/ui/Button";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  buildBlockPdfVaultFileName,
  buildConstructionBudgetBlockPdfSpec,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
} from "@/lib/blockPdfExport";
import { useDealWorkspaceEditorOptional } from "@/lib/file/useDealWorkspaceEditor";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import {
  PFS_FIELD_INPUT_CLASS,
  PFS_LABEL_CLASS,
  PFS_READONLY_TEXT_CLASS,
  PFS_SECTION_SHELL_CLASS,
  PFS_SECTION_TITLE_CLASS,
  PFS_TABLE_CLASS,
  PFS_TABLE_SHELL_CLASS,
  PFS_TD_CLASS,
  PFS_TEXTAREA_CLASS,
  PFS_TH_CLASS,
  PFS_TOTAL_ROW_CLASS,
} from "@/lib/pfs/pfsFormLayout";
import {
  CONSTRUCTION_BUDGET_PROJECT_TYPES,
  CONSTRUCTION_BUDGET_REPAIR_REPLACE,
  CONSTRUCTION_BUDGET_SECTIONS,
  CONSTRUCTION_BUDGET_TEMPLATE_REV,
  CONSTRUCTION_BUDGET_UNITS,
  computeConstructionBudget,
  formatConstructionBudgetMoney,
  headerHasContent,
  isValidCompletionTimeframeMonths,
  mapPersistedLinesToWorkbook,
  parseConstructionBudgetMoney,
  type ConstructionBudgetHeader,
  type ConstructionBudgetLineValues,
  type ConstructionBudgetWorkbookInput,
} from "@/lib/constructionBudget/constructionBudgetModel";

type BudgetLine = Doc<"constructionBudgetLines">;
type BudgetLineStatus = BudgetLine["status"];

const STATUS_OPTIONS: ReadonlyArray<{
  value: BudgetLineStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "on_hold", label: "On hold" },
];

function statusLabel(status: BudgetLineStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

const CELL = PFS_FIELD_INPUT_CLASS;
const SELECT_CLASS = cn(
  PFS_FIELD_INPUT_CLASS,
  "h-10 min-h-[40px] appearance-none bg-dlc-surface",
);

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className={PFS_SECTION_TITLE_CLASS}>{children}</h4>;
}

export type ConstructionBudgetBlockProps = {
  fileId: Id<"pipeline">;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function ConstructionBudgetBlock({
  fileId,
  memberUserKey,
  readOnly = false,
}: ConstructionBudgetBlockProps) {
  const editor = useDealWorkspaceEditorOptional();
  const workbook = useQuery(api.constructionBudget.getWorkbook, {
    fileId,
    ...(memberUserKey ? { memberUserKey } : {}),
  });
  const upsertHeader = useMutation(api.constructionBudget.upsertHeader);
  const upsertTemplateLine = useMutation(api.constructionBudget.upsertTemplateLine);
  const upsertLine = useMutation(api.constructionBudget.upsertLine);
  const setLineStatus = useMutation(api.constructionBudget.setLineStatus);
  const removeLine = useMutation(api.constructionBudget.removeLine);
  const migrateLegacyLines = useMutation(api.constructionBudget.migrateLegacyLines);

  const [headerDraft, setHeaderDraft] = useState<ConstructionBudgetHeader>({});
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, ConstructionBudgetLineValues>
  >({});
  const [customDraft, setCustomDraft] = useState({
    category: "",
    description: "",
    budgetAmount: "",
    spentAmount: "",
    drawNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const migratedRef = useRef<string | null>(null);
  const headerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const vaultEnabled = Boolean(memberUserKey) && !readOnly;
  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitDocumentVersion = useMutation(
    api.libraryDocuments.commitDocumentVersion,
  );
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const createFolder = useMutation(api.documentFolders.createFolder);
  const folders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    vaultEnabled
      ? { pipelineFileId: fileId, memberUserKey: memberUserKey! }
      : "skip",
  );
  const vaultMutations = useMemo((): VaultUploadMutations => {
    return {
      generateUploadUrl: (args) => generateUploadUrl(args),
      createDocument: (args) => createDocument(args),
      commitDocumentVersion: (args) => commitDocumentVersion(args),
      patchLinkMetadata: (args) => patchLinkMetadata(args),
    };
  }, [
    generateUploadUrl,
    createDocument,
    commitDocumentVersion,
    patchLinkMetadata,
  ]);

  const rows = workbook?.lines;
  const mapped = useMemo(
    () =>
      mapPersistedLinesToWorkbook(
        (rows ?? []).map((r) => ({
          _id: String(r._id),
          templateKey: r.templateKey,
          category: r.category,
          description: r.description,
          budgetAmount: r.budgetAmount,
          spentAmount: r.spentAmount,
          drawNumber: r.drawNumber,
          repairReplace: r.repairReplace,
          quantity: r.quantity,
          unitOfMeasure: r.unitOfMeasure,
          status: r.status,
        })),
      ),
    [rows],
  );

  const dirtyRef = useRef(false);
  const lastFileRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workbook) return;
    const fileKey = String(fileId);
    if (lastFileRef.current !== fileKey) {
      lastFileRef.current = fileKey;
      dirtyRef.current = false;
    }
    if (dirtyRef.current) return;
    setHeaderDraft(workbook.header ?? {});
    setLineDrafts(mapped.lines);
  }, [workbook, mapped.lines, fileId]);

  useEffect(() => {
    if (!workbook || readOnly || !memberUserKey) return;
    const fileKey = String(fileId);
    if (migratedRef.current === fileKey) return;
    const hasLegacy = (workbook.lines ?? []).some((r) => !r.templateKey);
    if (!hasLegacy || workbook.migratedAt) {
      migratedRef.current = fileKey;
      return;
    }
    migratedRef.current = fileKey;
    void migrateLegacyLines({
      fileId,
      memberUserKey,
    })
      .then(() => {
        dirtyRef.current = false;
      })
      .catch(() => {
        migratedRef.current = null;
      });
  }, [workbook, readOnly, memberUserKey, fileId, migrateLegacyLines]);

  useEffect(
    () => () => {
      if (headerTimer.current) clearTimeout(headerTimer.current);
      for (const t of lineTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const persistHeader = useCallback(
    (next: ConstructionBudgetHeader) => {
      dirtyRef.current = true;
      setHeaderDraft(next);
      if (readOnly || !memberUserKey) return;
      if (headerTimer.current) clearTimeout(headerTimer.current);
      headerTimer.current = setTimeout(() => {
        void upsertHeader({
          fileId,
          applicantName: next.applicantName,
          propertyAddress: next.propertyAddress,
          contractor: next.contractor,
          projectType: next.projectType || undefined,
          plannedSummary: next.plannedSummary,
          qualityOfFinishes: next.qualityOfFinishes,
          completionTimeframeMonths: next.completionTimeframeMonths,
          memberUserKey,
        }).catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
        });
      }, 400);
    },
    [fileId, memberUserKey, readOnly, upsertHeader],
  );

  const persistTemplateLine = useCallback(
    (key: string, next: ConstructionBudgetLineValues) => {
      dirtyRef.current = true;
      setLineDrafts((prev) => ({ ...prev, [key]: next }));
      if (readOnly || !memberUserKey) return;
      const existing = lineTimers.current.get(key);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        void upsertTemplateLine({
          fileId,
          templateKey: key,
          repairReplace: next.repairReplace || undefined,
          quantity: next.quantity,
          unitOfMeasure: next.unitOfMeasure || undefined,
          budgetAmount: next.budgetAmount,
          memberUserKey,
        }).catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
        });
      }, 400);
      lineTimers.current.set(key, t);
    },
    [fileId, memberUserKey, readOnly, upsertTemplateLine],
  );

  const workbookInput: ConstructionBudgetWorkbookInput = useMemo(
    () => ({
      header: headerDraft,
      lines: lineDrafts,
      customLines: mapped.customLines,
    }),
    [headerDraft, lineDrafts, mapped.customLines],
  );

  const computed = useMemo(
    () => computeConstructionBudget(workbookInput),
    [workbookInput],
  );

  const pipelineFileLabel =
    editor?.dealBundle?.pipeline?.fileName?.trim() ||
    headerDraft.applicantName?.trim() ||
    "file";

  const buildPdfSpec = useCallback(() => {
    return buildConstructionBudgetBlockPdfSpec(workbookInput, {
      fileName: buildBlockPdfVaultFileName(
        "Construction-Budget",
        pipelineFileLabel,
      ),
    });
  }, [workbookInput, pipelineFileLabel]);

  const savePdfToVault = useCallback(async () => {
    if (!memberUserKey) {
      throw new Error("Sign in to save to Document Vault.");
    }
    if (folders === undefined) {
      throw new Error("Document Vault is still loading. Try again in a moment.");
    }
    const { folderId, folderName } = await resolveBlockPdfVaultFolder({
      folders,
      pipelineFileId: fileId,
      memberUserKey,
      createFolder: (args) => createFolder(args),
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: "Construction Budget",
    });
    showOperationalToast({
      title: "Saved to Document Vault",
      description: `${saved.fileName} · ${folderName} folder · Open the Documents tab to view it.`,
      variant: "success",
      durationMs: 5200,
    });
  }, [
    memberUserKey,
    folders,
    fileId,
    createFolder,
    vaultMutations,
    buildPdfSpec,
  ]);

  const timeframeInvalid =
    Boolean(headerDraft.completionTimeframeMonths?.trim()) &&
    !isValidCompletionTimeframeMonths(headerDraft.completionTimeframeMonths);

  const meta = useMemo(() => {
    const filled =
      computed.filledLineCount > 0 ||
      computed.totalProjectCosts > 0 ||
      headerHasContent(headerDraft);
    return {
      status: filled ? "Configured" : "Draft",
      summary: filled
        ? `${formatConstructionBudgetMoney(computed.totalProjectCosts)} total · ${computed.filledLineCount} line(s)`
        : "Construction Lender Services budget — sections, dropdowns, and totals",
      indicatorCount: filled ? computed.filledLineCount || 1 : undefined,
    };
  }, [computed, headerDraft]);

  const addCustomLine = async () => {
    const category = customDraft.category.trim();
    if (!category) {
      setError("Category is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertLine({
        fileId,
        category,
        description: customDraft.description.trim() || undefined,
        budgetAmount: customDraft.budgetAmount.trim() || undefined,
        spentAmount: customDraft.spentAmount.trim() || undefined,
        drawNumber: customDraft.drawNumber.trim() || undefined,
        ...(memberUserKey ? { memberUserKey } : {}),
      });
      setCustomDraft({
        category: "",
        description: "",
        budgetAmount: "",
        spentAmount: "",
        drawNumber: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (workbook === undefined) {
    return (
      <div
        id={MODULAR_BLOCK_SECTION_IDS.constructionBudget}
        className="rounded-dlc-md border-2 border-foreground/20 bg-dlc-surface px-3 py-4 text-xs text-foreground/80"
        role="status"
      >
        Loading construction budget…
      </div>
    );
  }

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.constructionBudget}
      title="Construction budget"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<HardHat className="h-4 w-4" aria-hidden />}
      description={`Matches the Construction Lender Services budget workbook (Rev ${CONSTRUCTION_BUDGET_TEMPLATE_REV}). Section subtotals roll into Project Sub-Total; Total Project Costs = Project Sub-Total + Contractor Fees.`}
      lazyMount
      animated
      contentClassName="space-y-5"
      headerRight={
        <BlockPdfExportButton
          testId="construction-budget-pdf-export"
          label="Fillable Construction Budget PDF"
          buildSpec={buildPdfSpec}
          onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
        />
      }
    >
      <p className="text-[11px] leading-relaxed text-foreground/75">
        Budget Rev {CONSTRUCTION_BUDGET_TEMPLATE_REV} — Construction Lender
        Services 2025 Page 1 of 1. Project Type, Repair/Replace, and Unit of
        Measure use the Excel dropdown lists. Completion timeframe is 1–12
        months from closing.
      </p>

      <section className="space-y-2" aria-label="Budget header">
        <SectionTitle>Project</SectionTitle>
        <div
          className={cn(
            PFS_SECTION_SHELL_CLASS,
            "grid grid-cols-1 gap-3 space-y-0 p-2.5 sm:grid-cols-2",
          )}
        >
          <HeaderField
            label="Applicant Name"
            value={headerDraft.applicantName ?? ""}
            readOnly={readOnly}
            onChange={(v) => persistHeader({ ...headerDraft, applicantName: v })}
          />
          <HeaderField
            label="Property Address"
            value={headerDraft.propertyAddress ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              persistHeader({ ...headerDraft, propertyAddress: v })
            }
          />
          <HeaderField
            label="Contractor"
            value={headerDraft.contractor ?? ""}
            readOnly={readOnly}
            onChange={(v) => persistHeader({ ...headerDraft, contractor: v })}
          />
          <label className="flex min-w-0 flex-col gap-1">
            <span className={PFS_LABEL_CLASS}>Project Type</span>
            {readOnly ? (
              <span className={PFS_READONLY_TEXT_CLASS}>
                {headerDraft.projectType || "—"}
              </span>
            ) : (
              <select
                className={SELECT_CLASS}
                value={headerDraft.projectType ?? ""}
                aria-label="Project Type"
                onChange={(e) =>
                  persistHeader({
                    ...headerDraft,
                    projectType: e.target.value as ConstructionBudgetHeader["projectType"],
                  })
                }
              >
                <option value="">—</option>
                {CONSTRUCTION_BUDGET_PROJECT_TYPES.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className={PFS_LABEL_CLASS}>
              Summary of Planned Rehab or Construction
            </span>
            {readOnly ? (
              <span className={PFS_READONLY_TEXT_CLASS}>
                {headerDraft.plannedSummary || "—"}
              </span>
            ) : (
              <textarea
                className={PFS_TEXTAREA_CLASS}
                value={headerDraft.plannedSummary ?? ""}
                aria-label="Summary of Planned Rehab or Construction"
                onChange={(e) =>
                  persistHeader({
                    ...headerDraft,
                    plannedSummary: e.target.value,
                  })
                }
              />
            )}
          </label>
          <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className={PFS_LABEL_CLASS}>
              Description of Quality of Finishes
            </span>
            {readOnly ? (
              <span className={PFS_READONLY_TEXT_CLASS}>
                {headerDraft.qualityOfFinishes || "—"}
              </span>
            ) : (
              <textarea
                className={PFS_TEXTAREA_CLASS}
                value={headerDraft.qualityOfFinishes ?? ""}
                aria-label="Description of Quality of Finishes"
                onChange={(e) =>
                  persistHeader({
                    ...headerDraft,
                    qualityOfFinishes: e.target.value,
                  })
                }
              />
            )}
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={PFS_LABEL_CLASS}>
              Completion Timeframe (in months from closing date)
            </span>
            {readOnly ? (
              <span className={PFS_READONLY_TEXT_CLASS}>
                {headerDraft.completionTimeframeMonths || "—"}
              </span>
            ) : (
              <input
                className={cn(CELL, "h-10 min-h-[40px]")}
                value={headerDraft.completionTimeframeMonths ?? ""}
                inputMode="decimal"
                aria-label="Completion Timeframe (in months from closing date)"
                onChange={(e) =>
                  persistHeader({
                    ...headerDraft,
                    completionTimeframeMonths: e.target.value,
                  })
                }
              />
            )}
            {timeframeInvalid ? (
              <span className="text-[11px] text-destructive">
                Must be between 1 and 12 months.
              </span>
            ) : null}
          </label>
        </div>
      </section>

      {CONSTRUCTION_BUDGET_SECTIONS.map((section) => {
        const subtotal =
          section.id === "plans"
            ? computed.plansSubtotal
            : section.id === "sitework"
              ? computed.siteworkSubtotal
              : section.id === "building"
                ? computed.buildingSubtotal
                : section.id === "mechanical"
                  ? computed.mechanicalSubtotal
                  : section.id === "interior"
                    ? computed.interiorSubtotal
                    : computed.contractorFeesSubtotal;
        const qty = section.kind === "qty_measure";
        return (
          <section
            key={section.id}
            className="space-y-2"
            aria-label={section.title}
            data-testid={`construction-budget-section-${section.id}`}
          >
            <SectionTitle>
              {section.excelCode} {section.title}
            </SectionTitle>
            <div className={PFS_TABLE_SHELL_CLASS}>
              <table
                className={cn(PFS_TABLE_CLASS, "min-w-[42rem]")}
                data-testid={
                  section.id === "plans"
                    ? "construction-budget-table"
                    : undefined
                }
              >
                <thead>
                  <tr>
                    <th className={cn(PFS_TH_CLASS, "w-14 text-left")}>#</th>
                    <th className={cn(PFS_TH_CLASS, "text-left")}>Item</th>
                    {qty ? (
                      <>
                        <th className={cn(PFS_TH_CLASS, "text-left")}>
                          Repair/Replace
                        </th>
                        <th className={cn(PFS_TH_CLASS, "text-right")}>
                          Quantity
                        </th>
                        <th className={cn(PFS_TH_CLASS, "text-left")}>
                          Unit of Measure
                        </th>
                      </>
                    ) : null}
                    <th className={cn(PFS_TH_CLASS, "text-right")}>
                      Budget Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line) => {
                    const draft = lineDrafts[line.key] ?? {};
                    return (
                      <tr key={line.key}>
                        <td className={cn(PFS_TD_CLASS, "tabular-nums text-foreground/80")}>
                          {line.excelCode}
                        </td>
                        <td className={cn(PFS_TD_CLASS, "font-medium text-foreground")}>
                          {line.label}
                        </td>
                        {qty ? (
                          <>
                            <td className={PFS_TD_CLASS}>
                              {readOnly ? (
                                <span className={PFS_READONLY_TEXT_CLASS}>
                                  {draft.repairReplace || "—"}
                                </span>
                              ) : (
                                <select
                                  className={SELECT_CLASS}
                                  value={draft.repairReplace ?? ""}
                                  aria-label={`Repair/Replace for ${line.label}`}
                                  onChange={(e) =>
                                    persistTemplateLine(line.key, {
                                      ...draft,
                                      repairReplace: e.target
                                        .value as ConstructionBudgetLineValues["repairReplace"],
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {CONSTRUCTION_BUDGET_REPAIR_REPLACE.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className={PFS_TD_CLASS}>
                              {readOnly ? (
                                <span
                                  className={cn(
                                    PFS_READONLY_TEXT_CLASS,
                                    "justify-end tabular-nums",
                                  )}
                                >
                                  {draft.quantity || "—"}
                                </span>
                              ) : (
                                <input
                                  className={cn(
                                    CELL,
                                    "h-10 min-h-[40px] text-right tabular-nums",
                                  )}
                                  value={draft.quantity ?? ""}
                                  inputMode="decimal"
                                  aria-label={`Quantity for ${line.label}`}
                                  onChange={(e) =>
                                    persistTemplateLine(line.key, {
                                      ...draft,
                                      quantity: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </td>
                            <td className={PFS_TD_CLASS}>
                              {readOnly ? (
                                <span className={PFS_READONLY_TEXT_CLASS}>
                                  {draft.unitOfMeasure || "—"}
                                </span>
                              ) : (
                                <select
                                  className={SELECT_CLASS}
                                  value={draft.unitOfMeasure ?? ""}
                                  aria-label={`Unit of Measure for ${line.label}`}
                                  onChange={(e) =>
                                    persistTemplateLine(line.key, {
                                      ...draft,
                                      unitOfMeasure: e.target
                                        .value as ConstructionBudgetLineValues["unitOfMeasure"],
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {CONSTRUCTION_BUDGET_UNITS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </>
                        ) : null}
                        <td className={PFS_TD_CLASS}>
                          {readOnly ? (
                            <span
                              className={cn(
                                PFS_READONLY_TEXT_CLASS,
                                "justify-end tabular-nums",
                              )}
                            >
                              {draft.budgetAmount
                                ? formatConstructionBudgetMoney(
                                    parseConstructionBudgetMoney(
                                      draft.budgetAmount,
                                    ),
                                  )
                                : "—"}
                            </span>
                          ) : (
                            <input
                              className={cn(
                                CELL,
                                "h-10 min-h-[40px] text-right tabular-nums",
                              )}
                              value={draft.budgetAmount ?? ""}
                              inputMode="decimal"
                              placeholder="$"
                              aria-label={`Budget Amount for ${line.label}`}
                              onChange={(e) =>
                                persistTemplateLine(line.key, {
                                  ...draft,
                                  budgetAmount: e.target.value,
                                })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      className={cn(
                        PFS_TD_CLASS,
                        "border-t-2 border-foreground/30 font-semibold",
                      )}
                      colSpan={qty ? 5 : 2}
                    >
                      Subtotal
                    </td>
                    <td
                      className={cn(
                        PFS_TD_CLASS,
                        "border-t-2 border-foreground/30 text-right font-semibold tabular-nums",
                      )}
                    >
                      {formatConstructionBudgetMoney(subtotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      <div className={cn(PFS_SECTION_SHELL_CLASS, "space-y-2")}>
        <div className={PFS_TOTAL_ROW_CLASS}>
          <span>PROJECT SUB-TOTAL</span>
          <span className="tabular-nums">
            {formatConstructionBudgetMoney(computed.projectSubtotal)}
          </span>
        </div>
        <div className={PFS_TOTAL_ROW_CLASS}>
          <span>TOTAL PROJECT COSTS</span>
          <span className="tabular-nums">
            {formatConstructionBudgetMoney(computed.totalProjectCosts)}
          </span>
        </div>
      </div>

      {mapped.customLines.length > 0 ? (
        <section className="space-y-2" aria-label="Imported custom lines">
          <SectionTitle>Imported / custom lines</SectionTitle>
          <p className="text-[11px] text-foreground/75">
            Pre-template rows that did not match a catalog item. Amounts are
            kept; they are not part of Excel Project Sub-Total.
          </p>
          <div className={PFS_TABLE_SHELL_CLASS}>
            <table className={cn(PFS_TABLE_CLASS, "min-w-[42rem]")}>
              <thead>
                <tr>
                  <th className={cn(PFS_TH_CLASS, "text-left")}>Category</th>
                  <th className={cn(PFS_TH_CLASS, "text-left")}>Description</th>
                  <th className={cn(PFS_TH_CLASS, "text-right")}>Budget</th>
                  <th className={cn(PFS_TH_CLASS, "text-right")}>Spent</th>
                  <th className={cn(PFS_TH_CLASS, "text-left")}>Draw #</th>
                  <th className={cn(PFS_TH_CLASS, "text-left")}>Status</th>
                  {!readOnly ? (
                    <th className={PFS_TH_CLASS}>
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows
                  ?.filter((r) => !r.templateKey)
                  .map((line) => (
                    <tr key={line._id}>
                      <td className={cn(PFS_TD_CLASS, "font-medium")}>
                        {line.category}
                      </td>
                      <td className={cn(PFS_TD_CLASS, "text-foreground/80")}>
                        {line.description || "—"}
                      </td>
                      <td className={cn(PFS_TD_CLASS, "text-right tabular-nums")}>
                        {line.budgetAmount || "—"}
                      </td>
                      <td className={cn(PFS_TD_CLASS, "text-right tabular-nums")}>
                        {line.spentAmount || "—"}
                      </td>
                      <td className={PFS_TD_CLASS}>{line.drawNumber || "—"}</td>
                      <td className={PFS_TD_CLASS}>
                        {readOnly ? (
                          statusLabel(line.status)
                        ) : (
                          <select
                            className={SELECT_CLASS}
                            value={line.status}
                            aria-label={`Status for ${line.category}`}
                            onChange={(e) => {
                              const value = e.target.value as BudgetLineStatus;
                              void setLineStatus({
                                fileId,
                                lineId: line._id,
                                status: value,
                                ...(memberUserKey ? { memberUserKey } : {}),
                              });
                            }}
                          >
                            {STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      {!readOnly ? (
                        <td className={PFS_TD_CLASS}>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-10 w-10 min-h-[40px] min-w-[40px] p-0 text-foreground/70 hover:text-destructive"
                            aria-label={`Remove ${line.category} budget line`}
                            onClick={() =>
                              void removeLine({
                                fileId,
                                lineId: line._id,
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
        </section>
      ) : null}

      {!readOnly ? (
        <div className={cn(PFS_SECTION_SHELL_CLASS, "space-y-2")}>
          <p className={PFS_LABEL_CLASS}>Add custom budget line</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input
              className={cn(CELL, "h-10 min-h-[40px]")}
              value={customDraft.category}
              onChange={(e) =>
                setCustomDraft((d) => ({ ...d, category: e.target.value }))
              }
              placeholder="Category *"
              aria-label="Budget line category"
            />
            <input
              className={cn(CELL, "h-10 min-h-[40px]")}
              value={customDraft.description}
              onChange={(e) =>
                setCustomDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Description"
              aria-label="Budget line description"
            />
            <input
              className={cn(CELL, "h-10 min-h-[40px]")}
              value={customDraft.budgetAmount}
              onChange={(e) =>
                setCustomDraft((d) => ({ ...d, budgetAmount: e.target.value }))
              }
              placeholder="Budget $"
              inputMode="decimal"
              aria-label="Budget amount"
            />
            <input
              className={cn(CELL, "h-10 min-h-[40px]")}
              value={customDraft.spentAmount}
              onChange={(e) =>
                setCustomDraft((d) => ({ ...d, spentAmount: e.target.value }))
              }
              placeholder="Spent $"
              inputMode="decimal"
              aria-label="Spent amount"
            />
            <input
              className={cn(CELL, "h-10 min-h-[40px]")}
              value={customDraft.drawNumber}
              onChange={(e) =>
                setCustomDraft((d) => ({ ...d, drawNumber: e.target.value }))
              }
              placeholder="Draw #"
              aria-label="Draw number"
            />
          </div>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-10 min-h-[40px]"
            disabled={saving || customDraft.category.trim() === ""}
            onClick={() => void addCustomLine()}
            data-testid="construction-budget-add-line"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {saving ? "Adding…" : "Add line"}
          </Button>
        </div>
      ) : null}
    </CollapsibleBlock>
  );
}

function HeaderField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={PFS_LABEL_CLASS}>{label}</span>
      {readOnly || !onChange ? (
        <span className={PFS_READONLY_TEXT_CLASS}>{value || "—"}</span>
      ) : (
        <input
          className={cn(CELL, "h-10 min-h-[40px]")}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export default ConstructionBudgetBlock;
