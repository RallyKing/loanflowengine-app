"use client";

/**
 * Simple P&L block — layout & formulas mirror
 * `Simple P&L Template(Simple P&L).csv`. Multiple first-class timeframes per
 * file (`simplePlInstances`); legacy `simplePl` mirrors the first.
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
import { LineChart } from "lucide-react";
import { BlockPdfExportButton } from "@/components/library/BlockPdfExportButton";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import {
  buildBlockPdfVaultFileName,
  buildSimplePlBlockPdfSpec,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
} from "@/lib/blockPdfExport";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { useClientPortalBlockSessionOptional } from "@/lib/clientPortalDraftStore";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import type { Id } from "@/convex/_generated/dataModel";
import {
  PFS_COMPUTED_VALUE_CLASS,
  PFS_FIELD_INPUT_CLASS,
  PFS_LABEL_CLASS,
  PFS_LEDGER_GRID,
  PFS_LEDGER_ROW_CLASS,
  PFS_READONLY_TEXT_CLASS,
  PFS_SECTION_SHELL_CLASS,
  PFS_SECTION_TITLE_CLASS,
  PFS_TEXTAREA_CLASS,
  PFS_TOTAL_ROW_CLASS,
} from "@/lib/pfs/pfsFormLayout";
import {
  SIMPLE_PL_COGS_LINES,
  SIMPLE_PL_EXPENSE_LINES,
  SIMPLE_PL_OTHER_EXPENSE_LINES,
  SIMPLE_PL_REVENUE_LINES,
  computeSimplePl,
  createEmptySimplePlStatement,
  formatSimplePlMoney,
  type SimplePlCatalogLine,
  type SimplePlPeriodKind,
  type SimplePlStatement,
} from "@/lib/simplePl/simplePlModel";
import {
  createEmptySimplePlInstance,
  defaultSimplePlInstanceName,
  findSimplePlInstance,
  normalizeSimplePlInstances,
  removeSimplePlInstance,
  replaceSimplePlInstanceData,
  simplePlDealPatchFromInstances,
  simplePlInstanceDisplayName,
  type SimplePlInstance,
} from "@/lib/simplePl/simplePlInstances";
import { SimplePlInstanceChrome } from "./SimplePlInstanceChrome";

const CELL = PFS_FIELD_INPUT_CLASS;

function MoneyField({
  label,
  value,
  onChange,
  readOnly,
  computed,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  computed?: boolean;
}) {
  const locked = readOnly || computed || !onChange;
  return (
    <label className={cn(PFS_LEDGER_ROW_CLASS, PFS_LEDGER_GRID, "min-w-0")}>
      <span className={PFS_LABEL_CLASS}>
        {label}
        {computed ? (
          <span className="ml-1 font-normal text-foreground/60">(calc)</span>
        ) : null}
      </span>
      {locked ? (
        <span className={cn(PFS_COMPUTED_VALUE_CLASS, !computed && "bg-transparent")}>
          {value || "—"}
        </span>
      ) : (
        <input
          className={cn(CELL, "text-right tabular-nums")}
          value={value}
          inputMode="decimal"
          placeholder="$"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  readOnly,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className={PFS_LABEL_CLASS}>{label}</span>
      {readOnly || !onChange ? (
        <span className={PFS_READONLY_TEXT_CLASS}>{value || "—"}</span>
      ) : (
        <input
          className={CELL}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className={PFS_SECTION_TITLE_CLASS}>{children}</h4>;
}

function moneyGroupValue(
  statement: SimplePlStatement,
  line: SimplePlCatalogLine,
): string {
  if (line.section === "revenue") {
    return statement.revenue[line.key as keyof typeof statement.revenue] ?? "";
  }
  if (line.section === "cogs") {
    return statement.cogs[line.key as keyof typeof statement.cogs] ?? "";
  }
  if (line.section === "expenses") {
    return statement.expenses[line.key as keyof typeof statement.expenses] ?? "";
  }
  return (
    statement.otherExpenses[line.key as keyof typeof statement.otherExpenses] ??
    ""
  );
}

function patchMoneyGroup(
  statement: SimplePlStatement,
  line: SimplePlCatalogLine,
  value: string,
): SimplePlStatement {
  if (line.section === "revenue") {
    return {
      ...statement,
      revenue: { ...statement.revenue, [line.key]: value },
    };
  }
  if (line.section === "cogs") {
    return { ...statement, cogs: { ...statement.cogs, [line.key]: value } };
  }
  if (line.section === "expenses") {
    return {
      ...statement,
      expenses: { ...statement.expenses, [line.key]: value },
    };
  }
  return {
    ...statement,
    otherExpenses: { ...statement.otherExpenses, [line.key]: value },
  };
}

export type SimplePlBlockProps = {
  contactId: Id<"contacts"> | null;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function SimplePlBlock({
  contactId: _contactId,
  memberUserKey: memberUserKeyProp,
  readOnly = false,
}: SimplePlBlockProps) {
  void _contactId;
  const {
    draft,
    update,
    fileId,
    dealBundle,
    preferencesAccountId,
  } = useDealWorkspaceEditor();
  const portalSession = useClientPortalBlockSessionOptional();
  const portalMode = Boolean(portalSession);
  const hydratedFileRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const instancesRef = useRef<SimplePlInstance[]>([]);
  const activeIdRef = useRef<string | null>(null);

  const memberUserKey = (
    memberUserKeyProp ?? preferencesAccountId ?? ""
  ).trim();
  const vaultEnabled = Boolean(memberUserKey) && !readOnly;
  const organizationId = dealBundle?.pipeline?.organizationId;
  const [instances, setInstances] = useState<SimplePlInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [local, setLocal] = useState<SimplePlStatement>(() =>
    createEmptySimplePlStatement(),
  );

  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitDocumentVersion = useMutation(
    api.libraryDocuments.commitDocumentVersion,
  );
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const createFolder = useMutation(api.documentFolders.createFolder);
  const pullFromContact = useMutation(
    api.pipelineContacts.pullContactSimplePlToDeal,
  );
  const folders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    vaultEnabled
      ? { pipelineFileId: fileId, memberUserKey }
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

  const pipelineFileLabel =
    dealBundle?.pipeline?.fileName?.trim() ||
    local.header.companyName?.trim() ||
    "file";

  const activeInstance = findSimplePlInstance(instances, activeId);
  const buildPdfSpec = useCallback(() => {
    return buildSimplePlBlockPdfSpec(local, {
      fileName: buildBlockPdfVaultFileName(
        "Simple-PL",
        activeInstance?.name || pipelineFileLabel,
      ),
      instanceName: activeInstance
        ? simplePlInstanceDisplayName(activeInstance)
        : undefined,
      periodKind: activeInstance?.periodKind ?? local.periodKind,
    });
  }, [activeInstance, local, pipelineFileLabel]);

  const savePdfToVault = useCallback(async () => {
    if (!memberUserKey) {
      throw new Error("Sign in to save to Document Vault.");
    }
    if (folders === undefined) {
      throw new Error(
        "Document Vault is still loading. Try again in a moment.",
      );
    }
    const { folderId, folderName } = await resolveBlockPdfVaultFolder({
      folders,
      pipelineFileId: fileId,
      memberUserKey,
      createFolder: (args) => createFolder(args),
      defaultFolderName: "Simple P&L",
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: "Simple Profit and Loss",
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

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const persistInstances = useCallback(
    (next: SimplePlInstance[]) => {
      const patch = simplePlDealPatchFromInstances(next);
      setInstances(patch.simplePlInstances);
      instancesRef.current = patch.simplePlInstances;
      if (readOnly) return;
      (update as (key: string, value: unknown) => void)(
        "simplePlInstances",
        patch.simplePlInstances,
      );
      (update as (key: string, value: unknown) => void)(
        "simplePl",
        patch.simplePl,
      );
    },
    [readOnly, update],
  );

  useEffect(() => {
    if (!draft) return;
    const fileKey = String(draft._id);
    if (hydratedFileRef.current !== fileKey) {
      hydratedFileRef.current = fileKey;
      dirtyRef.current = false;
      setActiveId(null);
      activeIdRef.current = null;
    } else if (dirtyRef.current) {
      return;
    }

    const nextInstances = normalizeSimplePlInstances(draft);
    const currentActive = activeIdRef.current;
    const nextActive =
      (currentActive &&
        nextInstances.some((inst) => inst.id === currentActive) &&
        currentActive) ||
      nextInstances[0]?.id ||
      null;
    const active =
      findSimplePlInstance(nextInstances, nextActive) ?? nextInstances[0];
    setInstances(nextInstances);
    instancesRef.current = nextInstances;
    setActiveId(nextActive);
    activeIdRef.current = nextActive;
    setLocal(active?.data ?? createEmptySimplePlStatement());
  }, [draft]);

  const computed = useMemo(() => computeSimplePl(local), [local]);

  const persist = useCallback(
    (next: SimplePlStatement) => {
      dirtyRef.current = true;
      setLocal(next);
      if (readOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const currentInstances = instancesRef.current;
        const currentActive =
          activeIdRef.current ?? currentInstances[0]?.id;
        if (!currentActive) {
          persistInstances([
            {
              ...createEmptySimplePlInstance(),
              data: next,
            },
          ]);
          return;
        }
        persistInstances(
          replaceSimplePlInstanceData(currentInstances, currentActive, next),
        );
      }, 400);
    },
    [persistInstances, readOnly],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const patch = useCallback(
    (fn: (prev: SimplePlStatement) => SimplePlStatement) => {
      persist(fn(local));
    },
    [local, persist],
  );

  const meta = useMemo(() => {
    const filledCount = instances.filter(
      (inst) => computeSimplePl(inst.data).filledLineCount > 0,
    ).length;
    const filled = computed.filledLineCount > 0 || filledCount > 0;
    const active = findSimplePlInstance(instances, activeId);
    return {
      status: filled ? "Configured" : "Draft",
      summary: filled
        ? instances.length > 1
          ? `${instances.length} P&Ls · ${simplePlInstanceDisplayName(active ?? instances[0]!)} · Net ${formatSimplePlMoney(computed.netProfitLoss)}`
          : `Net ${formatSimplePlMoney(computed.netProfitLoss)} · Revenue ${formatSimplePlMoney(computed.totalRevenue)}`
        : "Simple P&L — revenue, CoGS, expenses & net profit",
      indicatorCount: filledCount > 0 ? filledCount : undefined,
    };
  }, [activeId, computed, instances]);

  if (!draft) {
    return (
      <div
        id={MODULAR_BLOCK_SECTION_IDS.simplePl}
        className="rounded-dlc-md border-2 border-foreground/20 bg-dlc-surface px-3 py-4 text-xs text-foreground/80"
        role="status"
      >
        Loading simple P&amp;L…
      </div>
    );
  }

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.simplePl}
      title="Simple P&L"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<LineChart className="h-4 w-4" aria-hidden />}
      description="Matches the Simple P&L template: TOTAL REVENUE, TOTAL CoGS, GROSS PROFIT/LOSS, TOTAL EXPENSES, NET OPERATING PROFIT/LOSS, TOTAL OTHER EXPENSES, and NET PROFIT/LOSS. Create Year-to-date plus past years as separate statements."
      lazyMount
      animated
      contentClassName="space-y-5"
      clientAssignBlockId={false}
      headerRight={
        <BlockPdfExportButton
          testId="simple-pl-block-pdf-export"
          label="Fillable Simple P&L PDF"
          buildSpec={buildPdfSpec}
          onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
        />
      }
    >
      <p className="text-[11px] leading-relaxed text-foreground/75">
        Create one P&amp;L per timeframe — Year-to-date, past years, or any named
        period. Assign contacts so they can complete it in the portal; statements
        stay sticky on those contacts for reuse on future files.
      </p>

      {!portalMode && activeId ? (
        <SimplePlInstanceChrome
          instances={instances}
          activeId={activeId}
          selectedIds={selectedIds}
          fileId={fileId}
          organizationId={organizationId}
          memberUserKey={memberUserKey || undefined}
          readOnly={readOnly}
          onSelect={(id) => {
            if (saveTimer.current) {
              clearTimeout(saveTimer.current);
              saveTimer.current = null;
            }
            dirtyRef.current = false;
            setActiveId(id);
            activeIdRef.current = id;
            const next = findSimplePlInstance(instancesRef.current, id);
            setLocal(next?.data ?? createEmptySimplePlStatement());
          }}
          onToggleSelected={(id) => {
            setSelectedIds((prev) =>
              prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id],
            );
          }}
          onCreate={(periodKind: SimplePlPeriodKind) => {
            const nextInst = createEmptySimplePlInstance({
              name: defaultSimplePlInstanceName(
                instancesRef.current.length,
                periodKind,
              ),
              periodKind,
            });
            persistInstances([...instancesRef.current, nextInst]);
            setActiveId(nextInst.id);
            activeIdRef.current = nextInst.id;
            setLocal(nextInst.data);
            dirtyRef.current = false;
          }}
          onRename={(id, name) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id ? { ...inst, name } : inst,
              ),
            );
          }}
          onAssignContacts={(id, contactIds) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id
                  ? { ...inst, assignedContactIds: contactIds }
                  : inst,
              ),
            );
          }}
          onVaultTaskReady={(id, vaultFileTaskId) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id ? { ...inst, vaultFileTaskId } : inst,
              ),
            );
          }}
          onImportFromContact={(contactId) => {
            void pullFromContact({
              fileId,
              contactId: contactId as Id<"contacts">,
              ...(memberUserKey
                ? { preferencesAccountId: memberUserKey }
                : {}),
            })
              .then((result) => {
                if (!result.ok) {
                  throw new Error("File changed. Refresh and try again.");
                }
                if (result.importedRowCount > 0) {
                  showOperationalToast({
                    title: "Imported from contact",
                    description: `${result.importedRowCount} P&L${result.importedRowCount === 1 ? "" : "s"} added without replacing existing timeframes.`,
                    variant: "success",
                  });
                }
              })
              .catch((e) => {
                showOperationalToast({
                  title: "Could not import Simple P&L",
                  description: e instanceof Error ? e.message : "Try again.",
                  variant: "destructive",
                });
              });
          }}
          onRemove={(id) => {
            const next = removeSimplePlInstance(instancesRef.current, id);
            persistInstances(next);
            const nextActive =
              activeIdRef.current === id
                ? next[0]?.id ?? null
                : activeIdRef.current;
            setActiveId(nextActive);
            activeIdRef.current = nextActive;
            const active = findSimplePlInstance(next, nextActive);
            setLocal(active?.data ?? createEmptySimplePlStatement());
            setSelectedIds((prev) => prev.filter((x) => x !== id));
            dirtyRef.current = false;
          }}
        />
      ) : null}

      <section className="space-y-2" aria-label="Statement header">
        <SectionTitle>Profit and Loss Statement</SectionTitle>
        <div
          className={cn(
            PFS_SECTION_SHELL_CLASS,
            "grid grid-cols-1 gap-3 space-y-0 p-2.5 sm:grid-cols-2",
          )}
        >
          <TextField
            label="YOUR COMPANY NAME"
            value={local.header.companyName ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, companyName: v } }))
            }
            className="sm:col-span-2"
          />
          <TextField
            label="For the Year Ended MM/DD/YYYY"
            value={local.header.periodEnded ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, periodEnded: v } }))
            }
          />
        </div>
      </section>

      <section className="space-y-2" aria-label="Revenue">
        <SectionTitle>REVENUE</SectionTitle>
        <div className={PFS_SECTION_SHELL_CLASS}>
          {SIMPLE_PL_REVENUE_LINES.map((line) => (
            <MoneyField
              key={line.key}
              label={line.label}
              value={moneyGroupValue(local, line)}
              readOnly={readOnly}
              onChange={(v) => patch((p) => patchMoneyGroup(p, line, v))}
            />
          ))}
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>TOTAL REVENUE</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.totalRevenue)}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-label="Cost of goods sold">
        <SectionTitle>COST OF GOODS SOLD</SectionTitle>
        <div className={PFS_SECTION_SHELL_CLASS}>
          {SIMPLE_PL_COGS_LINES.map((line) => (
            <MoneyField
              key={line.key}
              label={line.label}
              value={moneyGroupValue(local, line)}
              readOnly={readOnly}
              onChange={(v) => patch((p) => patchMoneyGroup(p, line, v))}
            />
          ))}
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>TOTAL CoGS</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.totalCogs)}
            </span>
          </div>
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>GROSS PROFIT/LOSS</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.grossProfitLoss)}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-label="Expenses">
        <SectionTitle>EXPENSES</SectionTitle>
        <div className={PFS_SECTION_SHELL_CLASS}>
          {SIMPLE_PL_EXPENSE_LINES.map((line) => (
            <MoneyField
              key={line.key}
              label={line.label}
              value={moneyGroupValue(local, line)}
              readOnly={readOnly}
              onChange={(v) => patch((p) => patchMoneyGroup(p, line, v))}
            />
          ))}
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>TOTAL EXPENSES</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.totalExpenses)}
            </span>
          </div>
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>NET OPERATING PROFIT/LOSS</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.netOperatingProfitLoss)}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-label="Other expenses">
        <SectionTitle>OTHER EXPENSES</SectionTitle>
        <div className={PFS_SECTION_SHELL_CLASS}>
          {SIMPLE_PL_OTHER_EXPENSE_LINES.map((line) => (
            <MoneyField
              key={line.key}
              label={line.label}
              value={moneyGroupValue(local, line)}
              readOnly={readOnly}
              onChange={(v) => patch((p) => patchMoneyGroup(p, line, v))}
            />
          ))}
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>TOTAL OTHER EXPENSES</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.totalOtherExpenses)}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2" aria-label="Net profit or loss">
        <SectionTitle>NET PROFIT/LOSS</SectionTitle>
        <div className={PFS_SECTION_SHELL_CLASS}>
          <div className={PFS_TOTAL_ROW_CLASS}>
            <span>NET PROFIT/LOSS</span>
            <span className="tabular-nums">
              {formatSimplePlMoney(computed.netProfitLoss)}
            </span>
          </div>
          <label className="mt-3 block">
            <span className={PFS_LABEL_CLASS}>Notes</span>
            {readOnly ? (
              <p className="mt-1 text-sm text-foreground">
                {local.notes?.trim() || "—"}
              </p>
            ) : (
              <textarea
                className={cn(PFS_TEXTAREA_CLASS, "mt-1")}
                value={local.notes ?? ""}
                aria-label="Notes"
                onChange={(e) =>
                  patch((p) => ({ ...p, notes: e.target.value }))
                }
              />
            )}
          </label>
        </div>
      </section>
    </CollapsibleBlock>
  );
}

export default SimplePlBlock;
