"use client";

/**
 * Track Record block — layout & formulas mirror `Track Record Template.xlsx`
 * (see `lib/trackRecord/trackRecordModel.ts`). Persists under deal
 * `trackRecord` / `trackRecordMeta`; dual-writes sticky rows to
 * `contactTrackRecordProperties`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, HardHat, Plus, Trash2 } from "lucide-react";
import { BlockPdfExportButton } from "@/components/library/BlockPdfExportButton";
import { ReoContactMultiAssign } from "@/components/intake/reo/ReoContactMultiAssign";
import { TrackRecordCopyToFileDialog } from "@/components/intake/trackRecord/TrackRecordCopyToFileDialog";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  buildBlockPdfVaultFileName,
  buildTrackRecordBlockPdfSpec,
  resolveBlockPdfVaultFolder,
  saveBlockFillablePdfToVault,
} from "@/lib/blockPdfExport";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import type { VaultUploadMutations } from "@/lib/library/uploadFileToVault";
import { MODULAR_BLOCK_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { normalizeContactIdList } from "@/lib/schedule/contactIds";
import {
  TRACK_RECORD_EXIT_OPTIONS,
  TRACK_RECORD_PROJECT_TYPE_OPTIONS,
  TRACK_RECORD_PROPERTY_TYPE_OPTIONS,
  TRACK_RECORD_YES_NO,
  computeTrackRecordExperience,
  computeTrackRecordScheduleTotals,
  createEmptyTrackRecordMeta,
  createEmptyTrackRecordRow,
  formatTrackRecordUsd,
  normalizeTrackRecordMeta,
  type DealTrackRecordRow,
  type TrackRecordBlockMeta,
  type TrackRecordGuarantorSlot,
} from "@/lib/trackRecord/trackRecordModel";

const CELL =
  "h-10 min-h-[40px] min-w-0 rounded-dlc-sm border border-border/80 bg-dlc-surface px-2 text-xs text-foreground";

export type TrackRecordBlockProps = {
  contactId?: Id<"contacts"> | null;
  memberUserKey?: string;
  readOnly?: boolean;
};

export function TrackRecordBlock({
  contactId: _contactId,
  memberUserKey: memberUserKeyProp,
  readOnly = false,
}: TrackRecordBlockProps) {
  void _contactId;
  const { draft, update, fileId, dealBundle, preferencesAccountId } =
    useDealWorkspaceEditor();
  const memberUserKey = (
    memberUserKeyProp ??
    preferencesAccountId ??
    ""
  ).trim();
  const organizationId = dealBundle?.pipeline?.organizationId;
  const pipelineFileLabel =
    dealBundle?.pipeline?.fileName?.trim() || "file";
  const vaultEnabled = Boolean(fileId && memberUserKey) && !readOnly;

  const rows = useMemo(
    () =>
      (Array.isArray((draft as { trackRecord?: unknown })?.trackRecord)
        ? ((draft as { trackRecord?: DealTrackRecordRow[] }).trackRecord ?? [])
        : []) as DealTrackRecordRow[],
    [draft],
  );
  const meta = useMemo(
    () =>
      normalizeTrackRecordMeta(
        (draft as { trackRecordMeta?: unknown })?.trackRecordMeta,
      ),
    [draft],
  );

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [copyOpen, setCopyOpen] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateUploadUrl = useMutation(api.libraryDocuments.generateUploadUrl);
  const createDocument = useMutation(api.libraryDocuments.createDocument);
  const commitDocumentVersion = useMutation(
    api.libraryDocuments.commitDocumentVersion,
  );
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const createFolder = useMutation(api.documentFolders.createFolder);
  const saveDualWrite = useMutation(api.pipelineContacts.saveTrackRecordDualWrite);
  const pullFromContact = useMutation(
    api.pipelineContacts.pullContactTrackRecordToDeal,
  );
  const folders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    vaultEnabled && fileId
      ? { pipelineFileId: fileId, memberUserKey }
      : "skip",
  );
  const linkedContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    fileId
      ? {
          fileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
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

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of linkedContacts ?? []) {
      map.set(String(c.contactId), c.name);
    }
    return map;
  }, [linkedContacts]);

  const namesForIds = useCallback(
    (ids: readonly string[] | undefined) =>
      normalizeContactIdList(ids).map((id) => contactNameById.get(id) || id),
    [contactNameById],
  );

  const persist = useCallback(
    (nextRows: DealTrackRecordRow[], nextMeta: TrackRecordBlockMeta) => {
      dirtyRef.current = true;
      (update as (key: string, value: unknown) => void)("trackRecord", nextRows);
      (update as (key: string, value: unknown) => void)(
        "trackRecordMeta",
        nextMeta,
      );
      if (readOnly || !fileId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveDualWrite({
          fileId,
          trackRecord: nextRows,
          trackRecordMeta: nextMeta,
          ...(memberUserKey ? { preferencesAccountId: memberUserKey } : {}),
        }).catch(() => {
          showOperationalToast({
            title: "Could not save Track Record",
            description: "Try again. Your last edits may not have synced.",
            variant: "destructive",
          });
        });
      }, 450);
    },
    [fileId, memberUserKey, readOnly, saveDualWrite, update],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const experience = useMemo(
    () => computeTrackRecordExperience(rows, meta),
    [rows, meta],
  );
  const totals = useMemo(
    () => computeTrackRecordScheduleTotals(rows),
    [rows],
  );

  const setRow = (i: number, patch: Partial<DealTrackRecordRow>) => {
    persist(
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
      meta,
    );
  };

  const setGuarantor = (i: number, patch: Partial<TrackRecordGuarantorSlot>) => {
    const guarantors = [...(meta.guarantors ?? createEmptyTrackRecordMeta().guarantors!)];
    while (guarantors.length < 4) guarantors.push({});
    guarantors[i] = { ...guarantors[i], ...patch };
    persist(rows, { ...meta, guarantors });
  };

  const buildPdfSpec = useCallback(() => {
    return buildTrackRecordBlockPdfSpec(rows, {
      fileName: buildBlockPdfVaultFileName(
        "Investment-Property-Track-Record",
        pipelineFileLabel,
      ),
      assignedContactNames: namesForIds(meta.assignedContactIds),
      blockMeta: meta,
      rowAssigneeNames: rows.map((r) => namesForIds(r.assignedContactIds)),
    });
  }, [rows, pipelineFileLabel, namesForIds, meta]);

  const savePdfToVault = useCallback(async () => {
    if (!memberUserKey || !fileId) {
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
      defaultFolderName: "Track Record",
    });
    const saved = await saveBlockFillablePdfToVault(buildPdfSpec(), {
      proof: { kind: "pipeline", pipelineFileId: fileId },
      memberUserKey,
      mutations: vaultMutations,
      folderId,
      title: "Investment Property Track Record",
    });
    showOperationalToast({
      title: "Saved to Document Vault",
      description: `${saved.fileName} · ${folderName} folder · Open the Documents tab to view it.`,
      variant: "success",
      durationMs: 5200,
    });
  }, [
    memberUserKey,
    fileId,
    folders,
    createFolder,
    vaultMutations,
    buildPdfSpec,
  ]);

  const selectedIndexes = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  const blockMetaStatus = useMemo(() => {
    const count = totals.propertyCount;
    return {
      status: count > 0 ? "Configured" : "Draft",
      summary:
        count > 0
          ? `${count} propert${count === 1 ? "y" : "ies"} · Qualifying ${experience.qualifyingTotal} (rehab ${experience.qualifyingRehab} / new ${experience.qualifyingNewConstruction})`
          : "Investment property track record — rehab & new construction experience",
      indicatorCount: count > 0 ? count : undefined,
    };
  }, [totals.propertyCount, experience]);

  if (!draft) {
    return (
      <div
        id={MODULAR_BLOCK_SECTION_IDS.trackRecord}
        className="rounded-dlc-md border-2 border-foreground/20 bg-dlc-surface px-3 py-4 text-xs text-foreground/80"
        role="status"
      >
        Loading track record…
      </div>
    );
  }

  return (
    <CollapsibleBlock
      id={MODULAR_BLOCK_SECTION_IDS.trackRecord}
      title="Track record"
      status={blockMetaStatus.status}
      summary={blockMetaStatus.summary}
      indicatorCount={blockMetaStatus.indicatorCount}
      icon={<HardHat className="h-4 w-4" aria-hidden />}
      description="Matches the Investment Property Track Record spreadsheet. Rehab / new-construction counts update from project type + owned-by-guarantor flags."
      lazyMount
      animated
      contentClassName="space-y-4"
      headerRight={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {fileId && !readOnly ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-10"
              data-testid="track-record-copy-to-file"
              onClick={() => setCopyOpen(true)}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Bring into file
            </Button>
          ) : null}
          <BlockPdfExportButton
            testId="track-record-block-pdf-export"
            label="Fillable Track Record PDF"
            buildSpec={buildPdfSpec}
            onSaveToVault={vaultEnabled ? savePdfToVault : undefined}
          />
        </div>
      }
    >
      <p className="text-[11px] leading-relaxed text-foreground/75">
        Please list all investment properties you have had ownership in over the
        last three years that have been constructed/renovated and sold or leased.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Block assignees
          </p>
          <ReoContactMultiAssign
            selectedIds={meta.assignedContactIds ?? []}
            onChange={(ids) => persist(rows, { ...meta, assignedContactIds: ids })}
            organizationId={organizationId}
            memberUserKey={memberUserKey || undefined}
            fileId={fileId}
            label="Assign track record to contacts"
            readOnly={readOnly}
          />
        </div>
        {!readOnly && fileId ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 shrink-0"
            data-testid="track-record-import-contact"
            onClick={() => {
              const ids = normalizeContactIdList(meta.assignedContactIds);
              const primary =
                ids[0] ||
                (linkedContacts?.[0] ? String(linkedContacts[0].contactId) : "");
              if (!primary) {
                showOperationalToast({
                  title: "Assign a contact first",
                  description:
                    "Block or file contacts are used to import reusable Track Record properties.",
                  variant: "destructive",
                });
                return;
              }
              void pullFromContact({
                fileId,
                contactId: primary as Id<"contacts">,
                ...(memberUserKey ? { preferencesAccountId: memberUserKey } : {}),
              })
                .then((result) => {
                  if (!result.ok) {
                    throw new Error("File changed. Refresh and try again.");
                  }
                  showOperationalToast({
                    title: "Imported from contact",
                    description: `${result.importedRowCount} propert${result.importedRowCount === 1 ? "y" : "ies"} added without replacing existing rows.`,
                    variant: "success",
                  });
                })
                .catch((e) => {
                  showOperationalToast({
                    title: "Could not import Track Record",
                    description: e instanceof Error ? e.message : "Try again.",
                    variant: "destructive",
                  });
                });
            }}
          >
            Import from contact
          </Button>
        ) : null}
      </div>

      <section aria-label="Experience summary" className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Experience
        </h3>
        <div className="max-w-full overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-xs">
            <thead>
              <tr className="text-left font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1 text-right">Rehab</th>
                <th className="px-2 py-1 text-right">New const.</th>
                <th className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {experience.guarantors.map((g, i) => (
                <tr key={`g-${i}`}>
                  <td className="px-2 py-1">
                    {readOnly ? (
                      <span>{g.name}</span>
                    ) : (
                      <Input
                        className={CELL}
                        value={meta.guarantors?.[i]?.name ?? ""}
                        aria-label={`Guarantor #${i + 1} name`}
                        placeholder={`Guarantor #${i + 1}`}
                        onChange={(e) =>
                          setGuarantor(i, { name: e.target.value })
                        }
                      />
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {g.rehabCount}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {g.newConstructionCount}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums font-medium">
                    {g.total}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-2 py-1">
                  Qualifying experience (highest individual)
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {experience.qualifyingRehab}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {experience.qualifyingNewConstruction}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {experience.qualifyingTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Properties
        </p>
        {!readOnly ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            onClick={() => persist([...rows, createEmptyTrackRecordRow()], meta)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Property
          </Button>
        ) : null}
      </div>

      <div className="max-w-full overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[2200px] border-separate border-spacing-y-2 text-xs">
          <thead>
            <tr className="text-left font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-2"> </th>
              <th className="px-2">#</th>
              <th className="px-2">Property address</th>
              <th className="px-2">City</th>
              <th className="px-2">ST</th>
              <th className="px-2">Zip</th>
              <th className="px-2">Type</th>
              <th className="px-2">#1</th>
              <th className="px-2">#2</th>
              <th className="px-2">#3</th>
              <th className="px-2">#4</th>
              <th className="px-2">Title held in name</th>
              <th className="px-2">Acquisition date</th>
              <th className="px-2">Acquisition price</th>
              <th className="px-2">Project type</th>
              <th className="px-2">Rehab / construction $</th>
              <th className="px-2">Exit</th>
              <th className="px-2">Date sold / leased</th>
              <th className="px-2">Sale price / rent</th>
              <th className="px-2">Assigned</th>
              <th className="px-2"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.rowId || `tr-${i}`}>
                <td className="px-2 align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.has(i)}
                    aria-label={`Select property ${i + 1}`}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      });
                    }}
                  />
                </td>
                <td className="px-2 align-middle tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "min-w-[12rem]")}
                    value={row.address ?? ""}
                    disabled={readOnly}
                    aria-label={`Address ${i + 1}`}
                    onChange={(e) => setRow(i, { address: e.target.value })}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-28")}
                    value={row.city ?? ""}
                    disabled={readOnly}
                    aria-label={`City ${i + 1}`}
                    onChange={(e) => setRow(i, { city: e.target.value })}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-14")}
                    value={row.state ?? ""}
                    disabled={readOnly}
                    aria-label={`State ${i + 1}`}
                    onChange={(e) => setRow(i, { state: e.target.value })}
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-20")}
                    value={row.zip ?? ""}
                    disabled={readOnly}
                    aria-label={`Zip ${i + 1}`}
                    onChange={(e) => setRow(i, { zip: e.target.value })}
                  />
                </td>
                <td className="px-1">
                  <select
                    className={cn(CELL, "w-32")}
                    value={row.propertyType ?? ""}
                    disabled={readOnly}
                    aria-label={`Property type ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { propertyType: e.target.value || undefined })
                    }
                  >
                    <option value=""> </option>
                    {TRACK_RECORD_PROPERTY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                {(["ownedByGuarantor1", "ownedByGuarantor2", "ownedByGuarantor3", "ownedByGuarantor4"] as const).map(
                  (key, gi) => (
                    <td key={key} className="px-1">
                      <select
                        className={cn(CELL, "w-16")}
                        value={row[key] ?? "No"}
                        disabled={readOnly}
                        aria-label={`Owned by guarantor ${gi + 1} row ${i + 1}`}
                        onChange={(e) => setRow(i, { [key]: e.target.value })}
                      >
                        {TRACK_RECORD_YES_NO.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  ),
                )}
                <td className="px-1">
                  <input
                    className={cn(CELL, "min-w-[10rem]")}
                    value={row.titleHeldInName ?? ""}
                    disabled={readOnly}
                    aria-label={`Title held ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { titleHeldInName: e.target.value })
                    }
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-32")}
                    value={row.acquisitionDate ?? ""}
                    disabled={readOnly}
                    aria-label={`Acquisition date ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { acquisitionDate: e.target.value })
                    }
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-28 text-right tabular-nums")}
                    value={row.acquisitionPrice ?? ""}
                    disabled={readOnly}
                    inputMode="decimal"
                    aria-label={`Acquisition price ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { acquisitionPrice: e.target.value })
                    }
                  />
                </td>
                <td className="px-1">
                  <select
                    className={cn(CELL, "w-40")}
                    value={row.projectType ?? ""}
                    disabled={readOnly}
                    aria-label={`Project type ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { projectType: e.target.value || undefined })
                    }
                  >
                    <option value=""> </option>
                    {TRACK_RECORD_PROJECT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-28 text-right tabular-nums")}
                    value={row.rehabOrConstructionAmount ?? ""}
                    disabled={readOnly}
                    inputMode="decimal"
                    aria-label={`Rehab or construction amount ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { rehabOrConstructionAmount: e.target.value })
                    }
                  />
                </td>
                <td className="px-1">
                  <select
                    className={cn(CELL, "w-24")}
                    value={row.exitType ?? ""}
                    disabled={readOnly}
                    aria-label={`Exit ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { exitType: e.target.value || undefined })
                    }
                  >
                    <option value=""> </option>
                    {TRACK_RECORD_EXIT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-36")}
                    value={row.dateSoldOrLeased ?? ""}
                    disabled={readOnly}
                    aria-label={`Date sold or leased ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { dateSoldOrLeased: e.target.value })
                    }
                  />
                </td>
                <td className="px-1">
                  <input
                    className={cn(CELL, "w-28 text-right tabular-nums")}
                    value={row.salePriceOrRentAmount ?? ""}
                    disabled={readOnly}
                    inputMode="decimal"
                    aria-label={`Sale price or rent ${i + 1}`}
                    onChange={(e) =>
                      setRow(i, { salePriceOrRentAmount: e.target.value })
                    }
                  />
                </td>
                <td className="px-1 align-top">
                  <ReoContactMultiAssign
                    compact
                    selectedIds={row.assignedContactIds ?? []}
                    onChange={(ids) => setRow(i, { assignedContactIds: ids })}
                    organizationId={organizationId}
                    memberUserKey={memberUserKey || undefined}
                    fileId={fileId}
                    label={`Assign property ${i + 1}`}
                    readOnly={readOnly}
                  />
                </td>
                <td className="px-1 align-middle">
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 w-10 min-h-[40px] p-0"
                      aria-label={`Remove property ${i + 1}`}
                      onClick={() =>
                        persist(
                          rows.filter((_, idx) => idx !== i),
                          meta,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={12} className="px-2 py-2 text-right">
                Totals
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatTrackRecordUsd(totals.acquisitionPrice)}
              </td>
              <td />
              <td className="px-2 py-2 text-right tabular-nums">
                {formatTrackRecordUsd(totals.rehabOrConstructionAmount)}
              </td>
              <td />
              <td />
              <td className="px-2 py-2 text-right tabular-nums">
                {formatTrackRecordUsd(totals.salePriceOrRentAmount)}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No properties yet. Add a row or import from an assigned contact.
        </p>
      ) : null}

      {fileId ? (
        <TrackRecordCopyToFileDialog
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          sourceFileId={fileId}
          memberUserKey={memberUserKey || undefined}
          selectedRowIndexes={selectedIndexes}
          defaultMode={selectedIndexes.length > 0 ? "rows" : "block"}
        />
      ) : null}
    </CollapsibleBlock>
  );
}

export default TrackRecordBlock;
