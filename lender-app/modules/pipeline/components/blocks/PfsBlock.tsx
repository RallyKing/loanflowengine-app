"use client";

/**
 * Personal Financial Statement block — layout & formulas mirror
 * `5 - Personal Financial Statement.xlsx` (see `lib/pfs/personalFinancialStatementModel.ts`).
 * Multiple first-class instances per file (`pfsInstances`); legacy `pfs` mirrors
 * the first. Dual-writes legacy assets/liabilities for contact sticky sync.
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
import { Landmark } from "lucide-react";
import { BlockPdfExportButton } from "@/components/library/BlockPdfExportButton";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";
import {
  buildBlockPdfVaultFileName,
  buildPfsBlockPdfSpec,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
} from "@/lib/blockPdfExport";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { useContactFirstBorrowerUpdate } from "@/lib/contacts/borrowerTabWriteAdapter";
import { useClientPortalBlockSessionOptional } from "@/lib/clientPortalDraftStore";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import type { Id } from "@/convex/_generated/dataModel";
import {
  computePersonalFinancialStatement,
  computeStockBondRowTotal,
  createEmptyPersonalFinancialStatement,
  formatPfsMoney,
  pfsToLegacyAssetLiabilityRows,
  seedPfsFromLegacyAssetLiabilityRows,
  type PersonalFinancialStatement,
  type PfsNotePayableRow,
  type PfsRealEstateParcel,
  type PfsStockBondRow,
} from "@/lib/pfs/personalFinancialStatementModel";
import { pfsAssociatedFormTitle } from "@/lib/pfs/pfsFormAssociation";
import {
  createEmptyPfsInstance,
  defaultPfsInstanceName,
  findPfsInstance,
  normalizePfsInstances,
  pfsDealPatchFromInstances,
  pfsInstanceDisplayName,
  removePfsInstance,
  replacePfsInstanceData,
  type PfsInstance,
} from "@/lib/pfs/pfsInstances";
import { PfsInstanceChrome } from "./PfsInstanceChrome";
import {
  PFS_COMPUTED_VALUE_CLASS,
  PFS_FIELD_INPUT_CLASS,
  PFS_LABEL_CLASS,
  PFS_LEDGER_GRID,
  PFS_LEDGER_GRID_WITH_MONTHLY,
  PFS_LEDGER_ROW_CLASS,
  PFS_LIFE_INSURANCE_COL_WIDTHS,
  PFS_NOTES_PAYABLE_COL_WIDTHS,
  PFS_READONLY_TEXT_CLASS,
  PFS_REAL_ESTATE_FIELD_COL,
  PFS_REAL_ESTATE_PROP_COL,
  PFS_SECTION_SHELL_CLASS,
  PFS_SECTION_TITLE_CLASS,
  PFS_STOCKS_COL_WIDTHS,
  PFS_TABLE_CLASS,
  PFS_TABLE_SHELL_CLASS,
  PFS_TD_CLASS,
  PFS_TEXTAREA_CLASS,
  PFS_TH_CLASS,
  PFS_TOTAL_ROW_CLASS,
} from "@/lib/pfs/pfsFormLayout";

const CELL = PFS_FIELD_INPUT_CLASS;

function MoneyField({
  label,
  value,
  onChange,
  readOnly,
  computed,
  className,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  computed?: boolean;
  className?: string;
}) {
  const locked = readOnly || computed || !onChange;
  return (
    <label
      className={cn(PFS_LEDGER_ROW_CLASS, PFS_LEDGER_GRID, "min-w-0", className)}
    >
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

/** Liability installment + monthly payment on one aligned ledger row. */
function InstallmentMoneyRow({
  balanceLabel,
  balanceValue,
  monthlyValue,
  readOnly,
  onBalanceChange,
  onMonthlyChange,
}: {
  balanceLabel: string;
  balanceValue: string;
  monthlyValue: string;
  readOnly?: boolean;
  onBalanceChange?: (v: string) => void;
  onMonthlyChange?: (v: string) => void;
}) {
  const locked = readOnly || !onBalanceChange || !onMonthlyChange;
  return (
    <div
      className={cn(PFS_LEDGER_ROW_CLASS, PFS_LEDGER_GRID_WITH_MONTHLY, "min-w-0")}
    >
      <span className={PFS_LABEL_CLASS}>{balanceLabel}</span>
      {locked ? (
        <>
          <span className={cn(PFS_COMPUTED_VALUE_CLASS, "bg-transparent")}>
            {balanceValue || "—"}
          </span>
          <span
            className={cn(PFS_COMPUTED_VALUE_CLASS, "bg-transparent")}
            aria-label={`${balanceLabel} monthly payments`}
          >
            {monthlyValue || "—"}
          </span>
        </>
      ) : (
        <>
          <input
            className={cn(CELL, "text-right tabular-nums")}
            value={balanceValue}
            inputMode="decimal"
            placeholder="$"
            aria-label={balanceLabel}
            onChange={(e) => onBalanceChange(e.target.value)}
          />
          <input
            className={cn(CELL, "text-right tabular-nums")}
            value={monthlyValue}
            inputMode="decimal"
            placeholder="Mo."
            aria-label={`${balanceLabel} monthly payments`}
            onChange={(e) => onMonthlyChange(e.target.value)}
          />
        </>
      )}
    </div>
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

function PfsColGroup({ widths }: { widths: readonly string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

export type PfsBlockProps = {
  contactId: Id<"contacts"> | null;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function PfsBlock({
  contactId: _contactId,
  memberUserKey: memberUserKeyProp,
  readOnly = false,
}: PfsBlockProps) {
  void _contactId;
  const {
    draft,
    update,
    fileId,
    dealBundle,
    preferencesAccountId,
  } = useDealWorkspaceEditor();
  const { update: dualWrite, assetsSaving } = useContactFirstBorrowerUpdate();
  const portalSession = useClientPortalBlockSessionOptional();
  const portalMode = Boolean(portalSession);
  const seededRef = useRef(false);
  const hydratedFileRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const instancesRef = useRef<PfsInstance[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const associatedFileRef = useRef<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ensureAssociations = useMutation(
    api.documentVaultFileTasks.ensurePfsInstanceAssociations,
  );

  const memberUserKey = (
    memberUserKeyProp ?? preferencesAccountId ?? ""
  ).trim();
  const vaultEnabled = Boolean(memberUserKey) && !readOnly;
  const organizationId = dealBundle?.pipeline?.organizationId;
  const [instances, setInstances] = useState<PfsInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  const [local, setLocal] = useState<PersonalFinancialStatement>(() =>
    createEmptyPersonalFinancialStatement(),
  );

  const pipelineFileLabel =
    dealBundle?.pipeline?.fileName?.trim() ||
    local.header.names?.trim() ||
    "file";
  const activeInstance = findPfsInstance(instances, activeId) ?? instances[0];
  const pdfTitle = activeInstance
    ? pfsAssociatedFormTitle(activeInstance)
    : "Personal Financial Statement";

  const buildPdfSpec = useCallback(() => {
    return buildPfsBlockPdfSpec(local, {
      title: pdfTitle,
      fileName: buildBlockPdfVaultFileName(
        pdfTitle.replace(/\s+/g, "-"),
        pipelineFileLabel,
      ),
    });
  }, [local, pdfTitle, pipelineFileLabel]);

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
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: pdfTitle,
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
    pdfTitle,
  ]);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const persistInstances = useCallback(
    (next: PfsInstance[], options?: { dualWritePrimary?: boolean }) => {
      const patch = pfsDealPatchFromInstances(next);
      setInstances(patch.pfsInstances);
      instancesRef.current = patch.pfsInstances;
      if (readOnly) return;
      (update as (key: string, value: unknown) => void)(
        "pfsInstances",
        patch.pfsInstances,
      );
      (update as (key: string, value: unknown) => void)("pfs", patch.pfs);
      if (options?.dualWritePrimary !== false && patch.pfsInstances[0]) {
        const legacy = pfsToLegacyAssetLiabilityRows(patch.pfsInstances[0].data);
        dualWrite("assets", legacy.assets);
        dualWrite("liabilities", legacy.liabilities);
      }
    },
    [dualWrite, readOnly, update],
  );

  useEffect(() => {
    if (!memberUserKey || readOnly || portalMode) return;
    if (!draft || instances.length === 0) return;
    const fileKey = String(fileId);
    if (associatedFileRef.current === fileKey) return;
    associatedFileRef.current = fileKey;
    void ensureAssociations({
      pipelineFileId: fileId,
      memberUserKey,
    })
      .then((result) => {
        if (result.pfsInstances?.length) {
          persistInstances(result.pfsInstances as PfsInstance[], {
            dualWritePrimary: false,
          });
        }
      })
      .catch(() => {
        associatedFileRef.current = null;
      });
  }, [
    draft,
    ensureAssociations,
    fileId,
    instances.length,
    memberUserKey,
    persistInstances,
    portalMode,
    readOnly,
  ]);

  useEffect(() => {
    if (!draft) return;
    const fileKey = String(draft._id);
    if (hydratedFileRef.current !== fileKey) {
      hydratedFileRef.current = fileKey;
      seededRef.current = false;
      dirtyRef.current = false;
      setActiveId(null);
      activeIdRef.current = null;
    } else if (dirtyRef.current) {
      return;
    }

    const nextInstances = normalizePfsInstances(draft);
    const currentActive = activeIdRef.current;
    const nextActive =
      (currentActive &&
        nextInstances.some((inst) => inst.id === currentActive) &&
        currentActive) ||
      nextInstances[0]?.id ||
      null;
    const active = findPfsInstance(nextInstances, nextActive) ?? nextInstances[0];
    const seeded = seedPfsFromLegacyAssetLiabilityRows(
      active?.data ?? createEmptyPersonalFinancialStatement(),
      active && nextInstances[0]?.id === active.id ? (draft.assets ?? []) : [],
      active && nextInstances[0]?.id === active.id
        ? (draft.liabilities ?? [])
        : [],
    );
    setInstances(nextInstances);
    instancesRef.current = nextInstances;
    setActiveId(nextActive);
    activeIdRef.current = nextActive;
    setLocal(seeded);
    if (
      !seededRef.current &&
      !(draft as { pfs?: unknown }).pfs &&
      !(draft as { pfsInstances?: unknown }).pfsInstances &&
      (seeded.assets.otherAssets || seeded.liabilities.otherLiabilities) &&
      active
    ) {
      seededRef.current = true;
      dirtyRef.current = true;
      persistInstances(
        replacePfsInstanceData(nextInstances, active.id, seeded),
      );
    }
  }, [draft, persistInstances]);

  const computed = useMemo(
    () => computePersonalFinancialStatement(local),
    [local],
  );

  const persist = useCallback(
    (next: PersonalFinancialStatement) => {
      dirtyRef.current = true;
      setLocal(next);
      if (readOnly) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const totals = computePersonalFinancialStatement(next);
        const payload = {
          ...next,
          totalAssets: String(Math.round(totals.totalAssets)),
          totalLiabilities: String(Math.round(totals.totalLiabilities)),
          netWorth: String(Math.round(totals.netWorth)),
        };
        const currentInstances = instancesRef.current;
        const currentActive =
          activeIdRef.current ?? currentInstances[0]?.id;
        if (!currentActive) {
          persistInstances([
            {
              ...createEmptyPfsInstance(),
              data: payload,
            },
          ]);
          return;
        }
        persistInstances(
          replacePfsInstanceData(currentInstances, currentActive, payload),
          {
            dualWritePrimary:
              currentInstances[0]?.id === currentActive,
          },
        );
      }, 400);
    },
    [persistInstances, readOnly],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (renameTimer.current) clearTimeout(renameTimer.current);
    },
    [],
  );

  const patch = useCallback(
    (fn: (prev: PersonalFinancialStatement) => PersonalFinancialStatement) => {
      persist(fn(local));
    },
    [local, persist],
  );

  const meta = useMemo(() => {
    const filledCount = instances.filter((inst) => {
      const c = computePersonalFinancialStatement(inst.data);
      return (
        c.totalAssets > 0 ||
        c.totalLiabilities > 0 ||
        Boolean(inst.data.header.names?.trim()) ||
        Boolean(inst.name?.trim() && inst.name !== "PFS 1")
      );
    }).length;
    const filled =
      computed.totalAssets > 0 ||
      computed.totalLiabilities > 0 ||
      Boolean(local.header.names?.trim()) ||
      filledCount > 0;
    const active = findPfsInstance(instances, activeId);
    return {
      status: filled ? "Configured" : "Draft",
      summary: filled
        ? instances.length > 1
          ? `${instances.length} PFSs · ${pfsInstanceDisplayName(active ?? instances[0]!)} · Net worth ${formatPfsMoney(computed.netWorth)}`
          : `Net worth ${formatPfsMoney(computed.netWorth)} · Assets ${formatPfsMoney(computed.totalAssets)}`
        : "SBA-style PFS — assets, liabilities, schedules & net worth",
      indicatorCount: filledCount > 0 ? filledCount : undefined,
    };
  }, [activeId, computed, instances, local.header.names]);

  if (!draft) {
    return (
      <div
        id={MODULAR_BLOCK_SECTION_IDS.pfs}
        className="rounded-dlc-md border-2 border-foreground/20 bg-dlc-surface px-3 py-4 text-xs text-foreground/80"
        role="status"
      >
        Loading personal financial statement…
      </div>
    );
  }

  const a = local.assets;
  const l = local.liabilities;
  const ac = computed.assetColumn;
  const lc = computed.liabilityColumn;

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.pfs}
      title="Personal financial statement"
      status={meta.status}
      summary={meta.summary}
      indicatorCount={meta.indicatorCount}
      icon={<Landmark className="h-4 w-4" aria-hidden />}
      description="Matches the standard PFS spreadsheet (Page 1–2 + Section 4). Schedule totals roll into assets/liabilities; net worth = total assets − total liabilities."
      lazyMount
      animated
      contentClassName="space-y-5"
      clientAssignBlockId={false}
      headerRight={
        <BlockPdfExportButton
          testId="pfs-block-pdf-export"
          label={`Fillable ${pdfTitle} PDF`}
          buildSpec={buildPdfSpec}
          onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
        />
      }
    >
      <p className="text-[11px] leading-relaxed text-foreground/75">
        Complete a PFS for: (1) each Borrower or (2) each limited partner who
        owns 20% or more interest and each general partner, or (3) each
        stockholder owning 20% or more of voting stock, or (4) any person or
        entity providing a guaranty on the loan. Create one PFS per person and
        assign contacts; each can have its own Document Vault task and password.
      </p>

      {!portalMode && activeId ? (
        <PfsInstanceChrome
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
            const next = findPfsInstance(instancesRef.current, id);
            setLocal(
              next?.data ?? createEmptyPersonalFinancialStatement(),
            );
          }}
          onToggleSelected={(id) => {
            setSelectedIds((prev) =>
              prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id],
            );
          }}
          onCreate={() => {
            if (!memberUserKey) {
              const nextInst = createEmptyPfsInstance({
                name: defaultPfsInstanceName(instancesRef.current.length),
              });
              persistInstances([...instancesRef.current, nextInst], {
                dualWritePrimary: false,
              });
              setActiveId(nextInst.id);
              activeIdRef.current = nextInst.id;
              setLocal(nextInst.data);
              dirtyRef.current = false;
              return;
            }
            void ensureAssociations({
              pipelineFileId: fileId,
              memberUserKey,
              createInstance: true,
              instanceName: defaultPfsInstanceName(instancesRef.current.length),
            })
              .then((result) => {
                if (result.pfsInstances?.length) {
                  persistInstances(result.pfsInstances as PfsInstance[], {
                    dualWritePrimary: false,
                  });
                }
                const newId = result.createdInstanceId;
                if (newId) {
                  setActiveId(newId);
                  activeIdRef.current = newId;
                  const created = findPfsInstance(
                    (result.pfsInstances as PfsInstance[] | undefined) ??
                      instancesRef.current,
                    newId,
                  );
                  setLocal(
                    created?.data ?? createEmptyPersonalFinancialStatement(),
                  );
                }
                dirtyRef.current = false;
                showOperationalToast({
                  title: "PFS created",
                  description:
                    "Linked to its own Forms & Applications title and Document Vault task.",
                  variant: "success",
                });
              })
              .catch((e) => {
                showOperationalToast({
                  title: "Could not create PFS",
                  description:
                    e instanceof Error ? e.message : "Try again.",
                  variant: "destructive",
                });
              });
          }}
          onRename={(id, name) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id ? { ...inst, name } : inst,
              ),
              { dualWritePrimary: false },
            );
            if (!memberUserKey) return;
            if (renameTimer.current) clearTimeout(renameTimer.current);
            renameTimer.current = setTimeout(() => {
              void ensureAssociations({
                pipelineFileId: fileId,
                memberUserKey,
                pfsInstanceId: id,
                instanceName: name,
              })
                .then((result) => {
                  if (result.pfsInstances?.length) {
                    persistInstances(result.pfsInstances as PfsInstance[], {
                      dualWritePrimary: false,
                    });
                  }
                })
                .catch(() => undefined);
            }, 450);
          }}
          onAssignContacts={(id, contactIds) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id
                  ? { ...inst, assignedContactIds: contactIds }
                  : inst,
              ),
              { dualWritePrimary: false },
            );
          }}
          onVaultTaskReady={(id, vaultFileTaskId) => {
            persistInstances(
              instancesRef.current.map((inst) =>
                inst.id === id ? { ...inst, vaultFileTaskId } : inst,
              ),
              { dualWritePrimary: false },
            );
          }}
          onRemove={(id) => {
            const next = removePfsInstance(instancesRef.current, id);
            persistInstances(next);
            const nextActive =
              activeIdRef.current === id
                ? next[0]?.id ?? null
                : activeIdRef.current;
            setActiveId(nextActive);
            activeIdRef.current = nextActive;
            const active = findPfsInstance(next, nextActive);
            setLocal(active?.data ?? createEmptyPersonalFinancialStatement());
            setSelectedIds((prev) => prev.filter((x) => x !== id));
            dirtyRef.current = false;
          }}
        />
      ) : null}

      {/* Header */}
      <section className="space-y-2" aria-label="Statement header">
        <SectionTitle>Applicant</SectionTitle>
        <div
          className={cn(
            PFS_SECTION_SHELL_CLASS,
            "grid grid-cols-1 gap-3 space-y-0 p-2.5 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          <TextField
            label="Name(s)"
            value={local.header.names ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, names: v } }))
            }
            className="sm:col-span-2"
          />
          <TextField
            label="Date"
            value={local.header.statementDate ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                header: { ...p.header, statementDate: v },
              }))
            }
          />
          <TextField
            label="Residence address"
            value={local.header.residenceAddress ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                header: { ...p.header, residenceAddress: v },
              }))
            }
            className="sm:col-span-2"
          />
          <TextField
            label="Residence phone"
            value={local.header.residencePhone ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                header: { ...p.header, residencePhone: v },
              }))
            }
          />
          <TextField
            label="City"
            value={local.header.city ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, city: v } }))
            }
          />
          <TextField
            label="State"
            value={local.header.state ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, state: v } }))
            }
          />
          <TextField
            label="ZIP"
            value={local.header.zip ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({ ...p, header: { ...p.header, zip: v } }))
            }
          />
          <TextField
            label="Business name of applicant/borrower"
            value={local.header.businessName ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                header: { ...p.header, businessName: v },
              }))
            }
            className="sm:col-span-2"
          />
          <TextField
            label="Business phone"
            value={local.header.businessPhone ?? ""}
            readOnly={readOnly}
            onChange={(v) =>
              patch((p) => ({
                ...p,
                header: { ...p.header, businessPhone: v },
              }))
            }
          />
        </div>
      </section>

      {/* Assets / Liabilities summary */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-2" aria-label="Assets">
          <SectionTitle>Assets ($ only, round up)</SectionTitle>
          <div className={PFS_SECTION_SHELL_CLASS}>
            <MoneyField
              label="Cash on hands & in Banks"
              value={a.cashOnHandAndBanks ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, cashOnHandAndBanks: v },
                }))
              }
            />
            <MoneyField
              label="Savings Accounts"
              value={a.savingsAccounts ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, savingsAccounts: v },
                }))
              }
            />
            <MoneyField
              label="IRA or Other Retirement Account"
              value={a.iraOrRetirement ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, iraOrRetirement: v },
                }))
              }
            />
            <MoneyField
              label="Accounts & Notes Receivable"
              value={a.accountsAndNotesReceivable ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, accountsAndNotesReceivable: v },
                }))
              }
            />
            <MoneyField
              label="Life Insurance — Cash Surrender Value Only"
              value={formatPfsMoney(ac.lifeInsuranceCashSurrender)}
              computed
            />
            <MoneyField
              label="Stocks & Bonds (Section 3)"
              value={formatPfsMoney(ac.stocksAndBonds)}
              computed
            />
            <MoneyField
              label="Real Estate (Section 4)"
              value={formatPfsMoney(ac.realEstate)}
              computed
            />
            <MoneyField
              label="Automobile — Present Value"
              value={a.automobilePresentValue ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, automobilePresentValue: v },
                }))
              }
            />
            <MoneyField
              label="Other Personal Property (Section 5)"
              value={a.otherPersonalProperty ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, otherPersonalProperty: v },
                }))
              }
            />
            <MoneyField
              label="Other Assets (Section 5)"
              value={a.otherAssets ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  assets: { ...p.assets, otherAssets: v },
                }))
              }
            />
            <div className={PFS_TOTAL_ROW_CLASS}>
              <span>Total assets</span>
              <span className="tabular-nums" data-testid="pfs-total-assets">
                {formatPfsMoney(computed.totalAssets)}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2" aria-label="Liabilities">
          <SectionTitle>Liabilities ($ only, round up)</SectionTitle>
          <div className={PFS_SECTION_SHELL_CLASS}>
            <MoneyField
              label="Accounts Payable"
              value={l.accountsPayable ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: { ...p.liabilities, accountsPayable: v },
                }))
              }
            />
            <MoneyField
              label="Notes Payable to Banks and Others (Section 2)"
              value={formatPfsMoney(lc.notesPayableToBanksAndOthers)}
              computed
            />
            <div
              className={cn(
                PFS_LEDGER_GRID_WITH_MONTHLY,
                "hidden gap-x-3 px-0 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70 sm:grid",
              )}
              aria-hidden
            >
              <span />
              <span className="text-right">Balance</span>
              <span className="text-right">Mo. pmt</span>
            </div>
            <InstallmentMoneyRow
              balanceLabel="Installment Account (Auto)"
              balanceValue={l.installmentAccountAuto ?? ""}
              monthlyValue={l.installmentAccountAutoMonthly ?? ""}
              readOnly={readOnly}
              onBalanceChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: {
                    ...p.liabilities,
                    installmentAccountAuto: v,
                  },
                }))
              }
              onMonthlyChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: {
                    ...p.liabilities,
                    installmentAccountAutoMonthly: v,
                  },
                }))
              }
            />
            <InstallmentMoneyRow
              balanceLabel="Installment Account (Other)"
              balanceValue={l.installmentAccountOther ?? ""}
              monthlyValue={l.installmentAccountOtherMonthly ?? ""}
              readOnly={readOnly}
              onBalanceChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: {
                    ...p.liabilities,
                    installmentAccountOther: v,
                  },
                }))
              }
              onMonthlyChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: {
                    ...p.liabilities,
                    installmentAccountOtherMonthly: v,
                  },
                }))
              }
            />
            <MoneyField
              label="Loan on Life Insurance"
              value={l.loanOnLifeInsurance ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: { ...p.liabilities, loanOnLifeInsurance: v },
                }))
              }
            />
            <MoneyField
              label="Mortgages on Real Estate (Section 4 A–D)"
              value={formatPfsMoney(lc.mortgagesOnRealEstate)}
              computed
            />
            <MoneyField
              label="Unpaid Taxes"
              value={l.unpaidTaxes ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: { ...p.liabilities, unpaidTaxes: v },
                }))
              }
            />
            <MoneyField
              label="Other Liabilities"
              value={l.otherLiabilities ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  liabilities: { ...p.liabilities, otherLiabilities: v },
                }))
              }
            />
            <div className={PFS_TOTAL_ROW_CLASS}>
              <span>Total liabilities</span>
              <span className="tabular-nums" data-testid="pfs-total-liabilities">
                {formatPfsMoney(computed.totalLiabilities)}
              </span>
            </div>
            <div
              className={cn(PFS_TOTAL_ROW_CLASS, "border-t border-foreground/20")}
              data-testid="pfs-net-worth-summary"
            >
              <span>Net worth</span>
              <span
                className={cn(
                  "tabular-nums",
                  computed.netWorth < 0 && "text-destructive",
                )}
              >
                {formatPfsMoney(computed.netWorth)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 text-xs font-medium text-foreground/75">
              <span>Total (liabilities side)</span>
              <span className="tabular-nums text-foreground">
                {formatPfsMoney(computed.liabilitiesSideTotal)}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Section 1 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-2" aria-label="Source of income">
          <SectionTitle>Section 1. Source of Income</SectionTitle>
          <div className={PFS_SECTION_SHELL_CLASS}>
            <MoneyField
              label="Salary"
              value={local.income.salary ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({ ...p, income: { ...p.income, salary: v } }))
              }
            />
            <MoneyField
              label="Net Investment Income"
              value={local.income.netInvestmentIncome ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  income: { ...p.income, netInvestmentIncome: v },
                }))
              }
            />
            <MoneyField
              label="Real Estate Income"
              value={local.income.realEstateIncome ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  income: { ...p.income, realEstateIncome: v },
                }))
              }
            />
            <MoneyField
              label="Other Income"
              value={local.income.otherIncome ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  income: { ...p.income, otherIncome: v },
                }))
              }
            />
            <TextField
              label="Description of Other Income"
              value={local.income.otherIncomeDescription ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  income: { ...p.income, otherIncomeDescription: v },
                }))
              }
            />
          </div>
        </section>
        <section className="space-y-2" aria-label="Contingent liabilities">
          <SectionTitle>Contingent Liabilities</SectionTitle>
          <div className={PFS_SECTION_SHELL_CLASS}>
            <MoneyField
              label="As Endorser or Co-Maker"
              value={local.contingentLiabilities.asEndorserOrCoMaker ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  contingentLiabilities: {
                    ...p.contingentLiabilities,
                    asEndorserOrCoMaker: v,
                  },
                }))
              }
            />
            <MoneyField
              label="Legal Claims & Judgments"
              value={local.contingentLiabilities.legalClaimsAndJudgments ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  contingentLiabilities: {
                    ...p.contingentLiabilities,
                    legalClaimsAndJudgments: v,
                  },
                }))
              }
            />
            <MoneyField
              label="Provision for Federal Income Tax"
              value={
                local.contingentLiabilities.provisionForFederalIncomeTax ?? ""
              }
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  contingentLiabilities: {
                    ...p.contingentLiabilities,
                    provisionForFederalIncomeTax: v,
                  },
                }))
              }
            />
            <MoneyField
              label="Other Special Debt"
              value={local.contingentLiabilities.otherSpecialDebt ?? ""}
              readOnly={readOnly}
              onChange={(v) =>
                patch((p) => ({
                  ...p,
                  contingentLiabilities: {
                    ...p.contingentLiabilities,
                    otherSpecialDebt: v,
                  },
                }))
              }
            />
          </div>
        </section>
      </div>

      {/* Section 2 — Notes payable */}
      <NotesPayableTable
        rows={local.notesPayable}
        readOnly={readOnly}
        onChange={(rows) => patch((p) => ({ ...p, notesPayable: rows }))}
        total={computed.notesPayableCurrentTotal}
      />

      {/* Section 3 — Stocks */}
      <StocksTable
        rows={local.stocksAndBonds}
        readOnly={readOnly}
        onChange={(rows) => patch((p) => ({ ...p, stocksAndBonds: rows }))}
        total={computed.stocksBondsTotal}
      />

      {/* Section 4 — REO */}
      <RealEstateTable
        parcels={local.realEstateOwned}
        readOnly={readOnly}
        onChange={(parcels) =>
          patch((p) => ({ ...p, realEstateOwned: parcels }))
        }
        marketTotal={computed.realEstateMarketTotal}
        mortgageTotal={computed.mortgagesOnReTotal}
      />

      {/* Sections 5–7 notes */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <SectionTitle>Section 5. Other personal property / assets</SectionTitle>
          <textarea
            className={PFS_TEXTAREA_CLASS}
            value={local.otherPersonalPropertyNotes ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              patch((p) => ({
                ...p,
                otherPersonalPropertyNotes: e.target.value,
              }))
            }
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <SectionTitle>Section 6. Unpaid taxes</SectionTitle>
          <textarea
            className={PFS_TEXTAREA_CLASS}
            value={local.unpaidTaxesNotes ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              patch((p) => ({ ...p, unpaidTaxesNotes: e.target.value }))
            }
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <SectionTitle>Section 7. Other liabilities</SectionTitle>
          <textarea
            className={PFS_TEXTAREA_CLASS}
            value={local.otherLiabilitiesNotes ?? ""}
            readOnly={readOnly}
            onChange={(e) =>
              patch((p) => ({ ...p, otherLiabilitiesNotes: e.target.value }))
            }
          />
        </label>
      </section>

      {/* Section 8 — Life insurance */}
      <section className="space-y-2" aria-label="Life insurance">
        <SectionTitle>Section 8. Life insurance held</SectionTitle>
        <div className={PFS_TABLE_SHELL_CLASS}>
          <table className={cn(PFS_TABLE_CLASS, "min-w-[36rem] table-fixed")}>
            <PfsColGroup widths={PFS_LIFE_INSURANCE_COL_WIDTHS} />
            <thead>
              <tr className="text-left">
                <th className={PFS_TH_CLASS}>Company</th>
                <th className={cn(PFS_TH_CLASS, "text-right")}>Face amount</th>
                <th className={cn(PFS_TH_CLASS, "text-right")}>Cash value</th>
                <th className={PFS_TH_CLASS}>Beneficiary</th>
              </tr>
            </thead>
            <tbody>
              {local.lifeInsurance.map((row, i) => (
                <tr key={i}>
                  {(
                    [
                      ["company", "text"],
                      ["faceAmount", "money"],
                      ["cashValue", "money"],
                      ["beneficiary", "text"],
                    ] as const
                  ).map(([field, kind]) => (
                    <td key={field} className={PFS_TD_CLASS}>
                      {readOnly ? (
                        <span
                          className={cn(
                            "block truncate px-0.5 text-foreground",
                            kind === "money" && "text-right tabular-nums",
                          )}
                        >
                          {row[field] || "—"}
                        </span>
                      ) : (
                        <input
                          className={cn(
                            CELL,
                            kind === "money" && "text-right tabular-nums",
                          )}
                          value={row[field] ?? ""}
                          inputMode={kind === "money" ? "decimal" : undefined}
                          aria-label={`Life insurance ${i + 1} ${field}`}
                          onChange={(e) =>
                            patch((p) => {
                              const lifeInsurance = [...p.lifeInsurance];
                              lifeInsurance[i] = {
                                ...lifeInsurance[i],
                                [field]: e.target.value,
                              };
                              return { ...p, lifeInsurance };
                            })
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-semibold text-foreground">
                <td className="px-2 py-2.5" colSpan={2}>
                  Cash surrender total (→ assets)
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {formatPfsMoney(computed.lifeInsuranceCashTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Signatures */}
      <section className="space-y-2" aria-label="Certification">
        <SectionTitle>Certification / signatures</SectionTitle>
        <p className="text-[11px] leading-relaxed text-foreground/75">
          I authorize Lender to make inquiries as necessary to verify the
          accuracy of the statements made and to determine my creditworthiness. I
          certify the above and the statements contained in the attachments are
          true and accurate as of the stated date(s).
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {local.signatures.map((sig, i) => (
            <div
              key={i}
              className={cn(
                PFS_SECTION_SHELL_CLASS,
                "grid grid-cols-1 gap-2 space-y-0 p-2.5 sm:grid-cols-3",
              )}
            >
              <TextField
                label="Signature"
                value={sig.signature ?? ""}
                readOnly={readOnly}
                onChange={(v) =>
                  patch((p) => {
                    const signatures = [...p.signatures] as [
                      (typeof p.signatures)[0],
                      (typeof p.signatures)[1],
                    ];
                    signatures[i] = { ...signatures[i], signature: v };
                    return { ...p, signatures };
                  })
                }
              />
              <TextField
                label="Date"
                value={sig.date ?? ""}
                readOnly={readOnly}
                onChange={(v) =>
                  patch((p) => {
                    const signatures = [...p.signatures] as [
                      (typeof p.signatures)[0],
                      (typeof p.signatures)[1],
                    ];
                    signatures[i] = { ...signatures[i], date: v };
                    return { ...p, signatures };
                  })
                }
              />
              <TextField
                label="Social Security No."
                value={sig.socialSecurityNo ?? ""}
                readOnly={readOnly}
                onChange={(v) =>
                  patch((p) => {
                    const signatures = [...p.signatures] as [
                      (typeof p.signatures)[0],
                      (typeof p.signatures)[1],
                    ];
                    signatures[i] = { ...signatures[i], socialSecurityNo: v };
                    return { ...p, signatures };
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      {assetsSaving ? (
        <p className="text-xs text-foreground/75" role="status">
          Saving…
        </p>
      ) : null}
    </CollapsibleBlock>
  );
}

function NotesPayableTable({
  rows,
  readOnly,
  onChange,
  total,
}: {
  rows: PfsNotePayableRow[];
  readOnly: boolean;
  onChange: (rows: PfsNotePayableRow[]) => void;
  total: number;
}) {
  const set = (i: number, patch: Partial<PfsNotePayableRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  return (
    <section className="space-y-2" aria-label="Notes payable">
      <SectionTitle>
        Section 2. Notes payable to banks and others
      </SectionTitle>
      <div className={PFS_TABLE_SHELL_CLASS}>
        <table className={cn(PFS_TABLE_CLASS, "min-w-[48rem] table-fixed")}>
          <PfsColGroup widths={PFS_NOTES_PAYABLE_COL_WIDTHS} />
          <thead>
            <tr className="text-left">
              <th className={PFS_TH_CLASS}>
                Name and address of noteholder(s)
              </th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>
                Original / credit limit
              </th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>Current balance</th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>Payment amount</th>
              <th className={PFS_TH_CLASS}>Frequency</th>
              <th className={PFS_TH_CLASS}>How secured / collateral</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {(
                  [
                    ["noteholderNameAddress", false],
                    ["originalBalanceOrCreditLimit", true],
                    ["currentBalance", true],
                    ["paymentAmount", true],
                    ["paymentFrequency", false],
                    ["howSecuredOrCollateral", false],
                  ] as const
                ).map(([field, money]) => (
                  <td key={field} className={PFS_TD_CLASS}>
                    {readOnly ? (
                      <span
                        className={cn(
                          "block truncate px-0.5 text-foreground",
                          money && "text-right tabular-nums",
                        )}
                      >
                        {row[field] || "—"}
                      </span>
                    ) : (
                      <input
                        className={cn(CELL, money && "text-right tabular-nums")}
                        value={row[field] ?? ""}
                        inputMode={money ? "decimal" : undefined}
                        aria-label={`Note ${i + 1} ${field}`}
                        onChange={(e) => set(i, { [field]: e.target.value })}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold text-foreground">
              <td className="px-2 py-2.5" colSpan={2}>
                Current balances total (→ liabilities)
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {formatPfsMoney(total)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function StocksTable({
  rows,
  readOnly,
  onChange,
  total,
}: {
  rows: PfsStockBondRow[];
  readOnly: boolean;
  onChange: (rows: PfsStockBondRow[]) => void;
  total: number;
}) {
  const set = (i: number, patch: Partial<PfsStockBondRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  return (
    <section className="space-y-2" aria-label="Stocks and bonds">
      <SectionTitle>Section 3. Stocks and bonds</SectionTitle>
      <div className={PFS_TABLE_SHELL_CLASS}>
        <table className={cn(PFS_TABLE_CLASS, "min-w-[44rem] table-fixed")}>
          <PfsColGroup widths={PFS_STOCKS_COL_WIDTHS} />
          <thead>
            <tr className="text-left">
              <th className={cn(PFS_TH_CLASS, "text-right")}># Shares</th>
              <th className={PFS_TH_CLASS}>Names of securities</th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>Cost</th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>
                Market value / quotation
              </th>
              <th className={PFS_TH_CLASS}>Date</th>
              <th className={cn(PFS_TH_CLASS, "text-right")}>Total value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className={PFS_TD_CLASS}>
                  {readOnly ? (
                    <span className="block truncate px-0.5 text-right tabular-nums text-foreground">
                      {row.numberOfShares || "—"}
                    </span>
                  ) : (
                    <input
                      className={cn(CELL, "text-right tabular-nums")}
                      value={row.numberOfShares ?? ""}
                      inputMode="decimal"
                      aria-label={`Stock ${i + 1} shares`}
                      onChange={(e) =>
                        set(i, { numberOfShares: e.target.value })
                      }
                    />
                  )}
                </td>
                <td className={PFS_TD_CLASS}>
                  {readOnly ? (
                    <span className="block truncate px-0.5 text-foreground">
                      {row.namesOfSecurities || "—"}
                    </span>
                  ) : (
                    <input
                      className={CELL}
                      value={row.namesOfSecurities ?? ""}
                      aria-label={`Stock ${i + 1} name`}
                      onChange={(e) =>
                        set(i, { namesOfSecurities: e.target.value })
                      }
                    />
                  )}
                </td>
                <td className={PFS_TD_CLASS}>
                  {readOnly ? (
                    <span className="block truncate px-0.5 text-right tabular-nums text-foreground">
                      {row.cost || "—"}
                    </span>
                  ) : (
                    <input
                      className={cn(CELL, "text-right tabular-nums")}
                      value={row.cost ?? ""}
                      inputMode="decimal"
                      aria-label={`Stock ${i + 1} cost`}
                      onChange={(e) => set(i, { cost: e.target.value })}
                    />
                  )}
                </td>
                <td className={PFS_TD_CLASS}>
                  {readOnly ? (
                    <span className="block truncate px-0.5 text-right tabular-nums text-foreground">
                      {row.marketValueQuotation || "—"}
                    </span>
                  ) : (
                    <input
                      className={cn(CELL, "text-right tabular-nums")}
                      value={row.marketValueQuotation ?? ""}
                      inputMode="decimal"
                      aria-label={`Stock ${i + 1} market`}
                      onChange={(e) =>
                        set(i, { marketValueQuotation: e.target.value })
                      }
                    />
                  )}
                </td>
                <td className={PFS_TD_CLASS}>
                  {readOnly ? (
                    <span className="block truncate px-0.5 text-foreground">
                      {row.dateOfQuotation || "—"}
                    </span>
                  ) : (
                    <input
                      className={CELL}
                      value={row.dateOfQuotation ?? ""}
                      aria-label={`Stock ${i + 1} date`}
                      onChange={(e) =>
                        set(i, { dateOfQuotation: e.target.value })
                      }
                    />
                  )}
                </td>
                <td
                  className={cn(
                    PFS_TD_CLASS,
                    "text-right tabular-nums text-foreground",
                  )}
                >
                  {formatPfsMoney(computeStockBondRowTotal(row))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold text-foreground">
              <td className="px-2 py-2.5" colSpan={5}>
                Total value (→ assets)
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {formatPfsMoney(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function RealEstateTable({
  parcels,
  readOnly,
  onChange,
  marketTotal,
  mortgageTotal,
}: {
  parcels: PfsRealEstateParcel[];
  readOnly: boolean;
  onChange: (parcels: PfsRealEstateParcel[]) => void;
  marketTotal: number;
  mortgageTotal: number;
}) {
  const fields: Array<{
    key: keyof PfsRealEstateParcel;
    label: string;
    money?: boolean;
  }> = [
    { key: "typeOfProperty", label: "Type of property" },
    { key: "address", label: "Address" },
    { key: "percentInterest", label: "Percent interest" },
    { key: "datePurchased", label: "Date purchased" },
    { key: "originalCost", label: "Original cost (× ownership %)", money: true },
    {
      key: "presentMarketValue",
      label: "Present mkt value (× ownership %)",
      money: true,
    },
    { key: "lenderNameAddress", label: "Name & address of lender" },
    { key: "mortgageAccountNumber", label: "Mortgage account number" },
    {
      key: "mortgageBalance",
      label: "Mortgage balance (× ownership %)",
      money: true,
    },
    {
      key: "monthlyPayment",
      label: "Amt of pmt / mo. (× ownership %)",
      money: true,
    },
    {
      key: "rentalIncomeMonthly",
      label: "Rental income / mo.",
      money: true,
    },
    { key: "statusOfMortgage", label: "Status of mortgage" },
  ];

  const reWidths = [
    PFS_REAL_ESTATE_FIELD_COL,
    ...parcels.map(() => PFS_REAL_ESTATE_PROP_COL),
  ];

  return (
    <section className="space-y-2" aria-label="Real estate owned">
      <SectionTitle>Section 4. Real estate owned (Properties A–H)</SectionTitle>
      <div className={PFS_TABLE_SHELL_CLASS}>
        <table className={cn(PFS_TABLE_CLASS, "min-w-[56rem] table-fixed")}>
          <PfsColGroup widths={reWidths} />
          <thead>
            <tr className="text-left">
              <th
                className={cn(
                  PFS_TH_CLASS,
                  "sticky left-0 z-10 bg-dlc-surface-high",
                )}
              >
                Field
              </th>
              {parcels.map((p) => (
                <th key={p.key} className={cn(PFS_TH_CLASS, "text-center")}>
                  Property {p.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key}>
                <td
                  className={cn(
                    PFS_TD_CLASS,
                    "sticky left-0 z-10 bg-dlc-surface text-[11px] font-medium text-foreground/90",
                  )}
                >
                  {f.label}
                </td>
                {parcels.map((parcel, pi) => (
                  <td key={parcel.key} className={PFS_TD_CLASS}>
                    {readOnly ? (
                      <span
                        className={cn(
                          "block truncate px-0.5 text-foreground",
                          f.money && "text-right tabular-nums",
                        )}
                      >
                        {(parcel[f.key] as string | undefined) || "—"}
                      </span>
                    ) : (
                      <input
                        className={cn(
                          CELL,
                          f.money && "text-right tabular-nums",
                        )}
                        value={(parcel[f.key] as string | undefined) ?? ""}
                        inputMode={f.money ? "decimal" : undefined}
                        aria-label={`Property ${parcel.key} ${f.label}`}
                        onChange={(e) => {
                          const next = parcels.map((p, idx) =>
                            idx === pi
                              ? { ...p, [f.key]: e.target.value }
                              : p,
                          );
                          onChange(next);
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-xs font-medium text-foreground/80">
        <span>
          Present mkt total (→ assets):{" "}
          <strong className="tabular-nums text-foreground">
            {formatPfsMoney(marketTotal)}
          </strong>
        </span>
        <span>
          Mortgage bal. A–D (→ liabilities):{" "}
          <strong className="tabular-nums text-foreground">
            {formatPfsMoney(mortgageTotal)}
          </strong>
        </span>
      </div>
    </section>
  );
}

export default PfsBlock;
