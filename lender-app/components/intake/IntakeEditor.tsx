"use client";

import {
  isLegacyBorrowersDealTabHidden,
  isLegacyDealWorkspaceMigratedDealTabHidden,
} from "@/lib/pipeline/fileWorkspaceLegacyVisibility";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Settings2,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { isShareSection } from "@/convex/shareSections";
import { FUNDING_TYPE_SUGGESTIONS } from "@/lib/intake/fundingTypeSuggestions";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Field, LinkedField, SectionCard, Select, TextArea, TextInput } from "./ui/Field";
import { deriveIntake } from "@/lib/intake/derivations";
import {
  sumAssetsEstimatedValue,
  sumIncomeRowsMonthly,
  sumLiabilitiesBalances,
  sumLiabilitiesMonthlyPayments,
} from "@/lib/intake/moneyAggregates";
import { exportCSV, exportJSON, exportXLSX } from "@/lib/intake/export";
import { exportFNMA34 } from "@/lib/intake/exportFnma";
import { pipelineFileHref } from "@/lib/intake/routes";
import { pipelineDealPrintHref } from "@/lib/pipeline/routes";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import {
  type DealWorkspaceLayoutV1,
  DEAL_TAB_LABELS,
  defaultDealWorkspaceLayout,
  moveDealWorkspaceTab,
  parseDealWorkspaceLayoutFromUnknown,
} from "@/lib/file/dealWorkspaceLayout";
import { dealTabFieldCount } from "@/lib/file/fileSectionMetrics";
import type {
  DealSectionProps,
  DealWorkspaceSheet,
  DealWorkspaceUpdater,
} from "@/lib/file/dealSectionTypes";
import { cn } from "@/lib/cn";
import { IntelligentAlertsCallout } from "@/components/IntelligentAlertsCallout";
import { buildDealIdentityAlerts } from "@/lib/intelligentAlerts";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SectionFieldCountBadge } from "@/components/SectionFieldCountBadge";
import { Button as UiButton } from "@/components/ui/Button";
import { ShareManager } from "./ShareManager";
import { SettingsLink } from "@/components/SettingsLink";
import { DealAnalysisWorkspace } from "./DealAnalysisWorkspace";
import { DealWorkspaceAiProvider } from "./DealWorkspaceAiContext";
import { CoverSection, ReoSection, ScenarioSection } from "./IntakeSections2";
import {
  BusinessSection,
  CommercialSection,
  FeesSection,
  GuarantorsSection,
  HardMoneySection,
} from "./IntakeSectionsBiz";

type Sheet = DealWorkspaceSheet;
type Patch = Partial<Sheet>;

export type IntakeEditorProps = {
  fileId: Id<"pipeline">;
  /** When true, omit pipeline navigation chrome (file drawer context). */
  embedded?: boolean;
};

function renderDealTab(
  tabId: DealTabId,
  draft: Sheet,
  update: DealWorkspaceUpdater,
  fileId: Id<"pipeline">
) {
  const props = { draft, update };
  switch (tabId) {
    case "cover":
      return <CoverSection {...props} />;
    case "scenario":
      return <ScenarioSection {...props} />;
    case "overview":
      return <OverviewSection {...props} />;
    case "borrowers":
      return <BorrowersSection {...props} />;
    case "guarantors":
      return <GuarantorsSection {...props} />;
    case "business":
      return <BusinessSection {...props} />;
    case "property":
      return <PropertySection {...props} />;
    case "commercial":
      return <CommercialSection {...props} />;
    case "hardmoney":
      return <HardMoneySection {...props} />;
    case "loans":
      return <LoansSection {...props} />;
    case "income":
      return <IncomeSection {...props} />;
    case "assets":
      return <AssetsSection {...props} />;
    case "household":
      return <HouseholdSection {...props} />;
    case "workflow":
      return <WorkflowSection {...props} />;
    case "notes":
      return <NotesSection {...props} />;
    case "reo":
      return <ReoSection {...props} />;
    case "analysis":
      return <DealAnalysisWorkspace {...props} dealFileKey={String(fileId)} />;
    case "fees":
      return <FeesSection {...props} />;
    default:
      return null;
  }
}

function DealWorkspaceLayoutSettings({
  layout,
  onChange,
}: {
  layout: DealWorkspaceLayoutV1;
  onChange: Dispatch<SetStateAction<DealWorkspaceLayoutV1>>;
}) {
  const [open, setOpen] = useState(false);

  const toggleHidden = useCallback(
    (id: DealTabId) => {
      onChange((prev) => {
        const isHidden = prev.hidden.includes(id);
        return {
          ...prev,
          hidden: isHidden
            ? prev.hidden.filter((x) => x !== id)
            : [...prev.hidden, id],
        };
      });
    },
    [onChange]
  );

  const move = useCallback(
    (id: DealTabId, dir: -1 | 1) => {
      onChange((prev) => ({
        ...prev,
        order: moveDealWorkspaceTab(prev.order, id, dir),
      }));
    },
    [onChange]
  );

  const reset = useCallback(() => {
    onChange(defaultDealWorkspaceLayout());
  }, [onChange]);

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 sm:px-4"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          Deal sections layout
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border/70 px-3 pb-3 pt-1 sm:px-4">
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Reorder sections, hide ones you rarely use, and collapse blocks to stay
            focused. Saved on this file (synced across devices).
          </p>
          <ul className="max-h-[min(40vh,18rem)] space-y-1 overflow-y-auto pr-1">
            {layout.order.map((id) => {
              const hidden = layout.hidden.includes(id);
              return (
                <li
                  key={id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-1.5 sm:flex-nowrap",
                    hidden && "opacity-60"
                  )}
                >
                  <span className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {DEAL_TAB_LABELS[id]}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move up"
                      aria-label={`Move ${DEAL_TAB_LABELS[id]} up`}
                      onClick={() => move(id, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title="Move down"
                      aria-label={`Move ${DEAL_TAB_LABELS[id]} down`}
                      onClick={() => move(id, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </UiButton>
                    <UiButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      title={hidden ? "Show section" : "Hide section"}
                      aria-label={
                        hidden
                          ? `Show ${DEAL_TAB_LABELS[id]}`
                          : `Hide ${DEAL_TAB_LABELS[id]}`
                      }
                      onClick={() => toggleHidden(id)}
                    >
                      {hidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </UiButton>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
            <UiButton type="button" size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset layout
            </UiButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function IntakeEditor({ fileId, embedded = false }: IntakeEditorProps) {
  const {
    fileId: editorFileId,
    dealBundle,
    sheet,
    shareIntakeId,
    draft,
    update,
    patchDealWorkspaceLayout,
    flush,
    saving,
    savedAt,
    isDirty,
    dealInitStatus,
    setDealInitStatus,
    dealInitAttemptedForFile,
    initDealDataIfMissing,
    preferencesAccountId,
    needsDealBootstrap,
  } = useDealWorkspaceEditor();

  if (editorFileId !== fileId) {
    throw new Error(
      "IntakeEditor fileId must match DealWorkspaceEditorProvider fileId",
    );
  }

  const [shareOpen, setShareOpen] = useState(false);
  const [shareSectionHint, setShareSectionHint] = useState<string>("cover");

  const identityAlerts = useMemo(
    () =>
      draft
        ? buildDealIdentityAlerts({
            clientName: draft.clientName,
            projectName: draft.projectName,
          })
        : [],
    [draft],
  );

  if (fileId && dealBundle === undefined) {
    return (
      <div
        className={cn(
          "flex min-h-[40vh] min-w-0 w-full flex-col items-center justify-center gap-3 py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading deal…</p>
      </div>
    );
  }

  if (fileId && dealBundle === null) {
    return (
      <div
        className={cn(
          "min-w-0 w-full py-8 sm:py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
      >
        <p className="text-sm text-muted-foreground">
          This pipeline file was not found.
        </p>
        <Link
          href="/pipeline"
          className="mt-3 inline-block text-sm font-medium text-foreground underline"
        >
          Back to pipeline
        </Link>
      </div>
    );
  }

  if (needsDealBootstrap && dealInitStatus === "error") {
    return (
      <div
        className={cn(
          "min-w-0 w-full py-8 sm:py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
      >
        <p className="text-sm text-destructive">
          Could not create deal data on this file. Try again or contact support.
        </p>
        <Button
          type="button"
          className="mt-4"
          onClick={() => {
            dealInitAttemptedForFile.current = null;
            setDealInitStatus("pending");
            void initDealDataIfMissing({
              fileId: fileId!,
              ...(preferencesAccountId ? { preferencesAccountId } : {}),
            })
              .then(() => setDealInitStatus("idle"))
              .catch(() => setDealInitStatus("error"));
          }}
        >
          Retry
        </Button>
        <Link
          href="/pipeline"
          className="mt-3 block text-sm font-medium text-foreground underline"
        >
          Back to pipeline
        </Link>
      </div>
    );
  }

  if (
    needsDealBootstrap &&
    (dealInitStatus === "pending" || dealInitStatus === "idle")
  ) {
    return (
      <div
        className={cn(
          "flex min-h-[40vh] min-w-0 w-full flex-col items-center justify-center gap-3 py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          Preparing deal workspace on this file…
        </p>
      </div>
    );
  }

  if (sheet === undefined || !draft) {
    return (
      <div
        className={cn(
          "flex min-h-[40vh] min-w-0 w-full flex-col items-center justify-center gap-3 py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading deal…</p>
      </div>
    );
  }
  if (sheet === null) {
    return (
      <div
        className={cn(
          "min-w-0 w-full py-8 sm:py-10",
          embedded ? "mx-0 max-w-none" : "md:mx-auto md:max-w-[72rem]",
        )}
      >
        <p className="text-sm text-muted-foreground">
          {dealBundle?.pipeline?.intakeSheetId
            ? "The linked intake sheet was not found. Restore the intake row or remove the link on the file."
            : "This pipeline file or its deal data was not found."}
        </p>
        <Link href="/pipeline" className="mt-3 inline-block text-sm font-medium text-foreground underline">
          Back to pipeline
        </Link>
      </div>
    );
  }

  const wsLayout = parseDealWorkspaceLayoutFromUnknown(draft.dealWorkspaceLayout);
  const visibleTabs = wsLayout.order.filter(
    (id) =>
      !wsLayout.hidden.includes(id) &&
      !isLegacyBorrowersDealTabHidden(id) &&
      !isLegacyDealWorkspaceMigratedDealTabHidden(id),
  );

  const sectionExpanded = (tid: DealTabId) => wsLayout.expanded[tid] === true;

  const setSectionExpanded = (tid: DealTabId, next: boolean) => {
    patchDealWorkspaceLayout((prev) => ({
      ...prev,
      expanded: { ...prev.expanded, [tid]: next },
    }));
  };

  return (
    <DealWorkspaceAiProvider fileId={fileId}>
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col gap-5 py-4 motion-safe:transition-[gap] sm:gap-6 sm:py-6",
        embedded
          ? "mx-0 max-w-none px-0 py-3 md:py-6"
          : "px-4 sm:px-6 md:mx-auto md:max-w-[72rem]",
      )}
    >
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-3">
            {!embedded ? (
              <>
                <Link
                  href="/pipeline"
                  className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  title="Back to pipeline hub"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Pipeline</span>
                </Link>
              </>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                Deal workspace
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 md:justify-end md:gap-3">
            <DealWorkspaceSaveStatus
              saving={saving}
              savedAt={savedAt}
              isDirty={isDirty}
            />
            <SettingsLink
              section="workflow"
              iconOnly
              className="h-8 w-8 shrink-0 shadow-none"
              ariaLabel="Open settings: intake auto-save and pipeline defaults"
            />
            {shareIntakeId ? (
              <ShareButton
                onClick={() => {
                  setShareSectionHint("cover");
                  setShareOpen(true);
                }}
              />
            ) : null}
            <ExportMenu sheet={draft} onBeforeExport={flush} pipelinePrintFileId={fileId} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Field label="Client name *">
            <TextInput
              value={draft.clientName}
              onChange={(e) => update("clientName", e.target.value)}
            />
          </Field>
          <Field label="Project name *">
            <TextInput
              value={draft.projectName}
              onChange={(e) => update("projectName", e.target.value)}
            />
          </Field>
          <Field label="File name">
            <TextInput
              value={draft.fileName ?? ""}
              onChange={(e) => update("fileName", e.target.value)}
            />
          </Field>
        </div>
        {identityAlerts.length > 0 ? (
          <IntelligentAlertsCallout alerts={identityAlerts} maxVisible={2} />
        ) : null}
      </header>

      <div className="flex min-h-0 min-w-0 flex-col gap-5">
        <DealWorkspaceLayoutSettings
          layout={wsLayout}
          onChange={patchDealWorkspaceLayout}
        />

        {visibleTabs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            All deal sections are hidden. Open{" "}
            <span className="font-medium text-foreground">Deal sections layout</span>{" "}
            to show the ones you need.
          </div>
        ) : (
          <div className="flex flex-col gap-4" aria-label="Deal sections">
            {visibleTabs.map((tid) => (
              <div
                key={tid}
                id={`deal-workspace-${tid}`}
                className="scroll-mt-6"
              >
                <CollapsibleSection
                  variant="card"
                  animated
                  open={sectionExpanded(tid)}
                  onOpenChange={(o) => {
                    setSectionExpanded(tid, o);
                    if (o) {
                      setShareSectionHint(tid === "analysis" ? "dti" : tid);
                    }
                  }}
                  headerRight={
                    <SectionFieldCountBadge count={dealTabFieldCount(tid, draft)} />
                  }
                  title={
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {DEAL_TAB_LABELS[tid]}
                    </span>
                  }
                  description={
                    tid === "analysis"
                      ? "DTI, comparisons, weighted rate, payoff, and date tools."
                      : undefined
                  }
                  contentClassName="space-y-4"
                >
                  {renderDealTab(tid, draft, update, fileId)}
                </CollapsibleSection>
              </div>
            ))}
          </div>
        )}
      </div>

      {shareOpen && shareIntakeId ? (
        <ShareManager
          intakeId={shareIntakeId}
          currentSection={
            isShareSection(shareSectionHint) ? shareSectionHint : "cover"
          }
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>
    </DealWorkspaceAiProvider>
  );
}

function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      Share
    </button>
  );
}

function ExportMenu({
  sheet,
  onBeforeExport,
  pipelinePrintFileId,
}: {
  sheet: Sheet;
  onBeforeExport: () => Promise<void> | void;
  pipelinePrintFileId?: Id<"pipeline">;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(
    kind: "csv" | "xlsx" | "json" | "print" | "pdf" | "fnma",
  ) {
    try {
      setBusy(kind);
      await onBeforeExport();
      if (kind === "csv") exportCSV(sheet);
      else if (kind === "xlsx") await exportXLSX(sheet);
      else if (kind === "json") exportJSON(sheet);
      else if (kind === "fnma") exportFNMA34(sheet);
      else if (kind === "print" || kind === "pdf") {
        const href = pipelinePrintFileId
          ? pipelineDealPrintHref(pipelinePrintFileId)
          : null;
        if (href) window.open(href, "_blank");
      }
    } catch (err) {
      console.error(err);
      alert("Export failed. Check the console for details.");
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[var(--dlc-z-dropdown,38)] isolate mt-1 max-h-[min(24rem,70dvh)] w-60 max-w-[min(100%,calc(100dvw-2rem))] overflow-y-auto overflow-x-hidden rounded-xl border border-border/90 bg-background text-sm shadow-dlc-3 [background-color:rgb(var(--bg))]"
        >
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("pdf")}
            icon={<PdfIcon />}
            title="PDF"
            subtitle="Opens print view → Save as PDF"
            busy={busy === "pdf"}
          />
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("print")}
            icon={<PrintIcon />}
            title="Print"
            subtitle="Clean one-page printout"
            busy={busy === "print"}
          />
          <div className="my-1 border-t border-border/80" />
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("xlsx")}
            icon={<XlsIcon />}
            title="Excel (.xlsx)"
            subtitle="Workbook with a sheet per section"
            busy={busy === "xlsx"}
          />
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("csv")}
            icon={<CsvIcon />}
            title="CSV"
            subtitle="Flat key/value + tables"
            busy={busy === "csv"}
          />
          <div className="my-1 border-t border-border/80" />
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("fnma")}
            icon={<FnmaIcon />}
            title="FNMA 3.4 (MISMO XML)"
            subtitle="URLA / 1003 for Encompass, Arive, LOS"
            busy={busy === "fnma"}
          />
          <MenuItem
            disabled={busy !== null}
            onClick={() => run("json")}
            icon={<JsonIcon />}
            title="JSON backup"
            subtitle="Full document"
            busy={busy === "json"}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex flex-col">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {title}
          {busy ? <span className="text-xs text-muted-foreground">…</span> : null}
        </span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="M8 15h2" />
      <path d="M12 15h.01" />
      <path d="M14 15h2" />
    </svg>
  );
}
function PrintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
function XlsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="m8 13 4 6" />
      <path d="m12 13-4 6" />
    </svg>
  );
}
function CsvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="M8 13h2" />
      <path d="M8 17h8" />
    </svg>
  );
}
function JsonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="M9 13c-1 0-1 1-1 2s0 2 1 2" />
      <path d="M15 13c1 0 1 1 1 2s0 2-1 2" />
    </svg>
  );
}
function FnmaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="m9 13-2 2 2 2" />
      <path d="m15 13 2 2-2 2" />
    </svg>
  );
}

export type Updater = DealWorkspaceUpdater;
export type SectionProps = DealSectionProps;

/* ------------------------------ Overview ------------------------------ */

const FUNDING_TYPE_MAX_LEN = 120;

export function OverviewSection({ draft, update }: SectionProps) {
  const fundingTypeListId = useId();
  return (
    <SectionCard
      title="File details"
      description="Identifiers, economic summary, and classifications on this file. The pipeline reads Funding amount, Funding type, and Source from here (same funding field as the coversheet)."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Funding amount ($)"
          className="md:col-span-2"
          hint="Principal or gross funding amount in USD, stored on `cover.fundingAmount` (same control as the coversheet). Use digits only; formatting is normalized on save. Cleared here updates the pipeline row when no other deal amount applies."
        >
          <TextInput
            data-testid="deal-overview-funding-input"
            value={(() => {
              const c = draft.cover as { fundingAmount?: string } | undefined;
              return c?.fundingAmount ?? "";
            })()}
            placeholder="e.g. 450000"
            inputMode="decimal"
            onChange={(e) => {
              const cur = (draft.cover ?? {}) as Record<string, unknown>;
              update("cover", {
                ...cur,
                fundingAmount: e.target.value,
              } as never);
            }}
          />
        </Field>
        <Field
          label="Funding type"
          className="md:col-span-2"
          hint="Product or program label for this obligation (same field as the pipeline “Funding type” column). Suggestions are optional — enter the legal or marketing term your institution uses (max 120 characters)."
        >
          <TextInput
            list={fundingTypeListId}
            value={draft.fundingType ?? ""}
            placeholder="e.g. DSCR, SBA, bridge, line of credit"
            onChange={(e) => {
              const v = e.target.value;
              if (v.length <= FUNDING_TYPE_MAX_LEN) {
                update("fundingType", v);
              }
            }}
          />
          <datalist id={fundingTypeListId}>
            {FUNDING_TYPE_SUGGESTIONS.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </Field>
        <Field label="Lead ID">
          <TextInput
            value={draft.leadId ?? ""}
            onChange={(e) => update("leadId", e.target.value)}
          />
        </Field>
        <Field
          label="Source (lead origin)"
          hint="Used for the pipeline Source column (with borrower context when set)."
        >
          <TextInput
            value={draft.sourceType ?? ""}
            onChange={(e) => update("sourceType", e.target.value)}
          />
        </Field>
        <Field label="Account executive">
          <TextInput
            value={draft.accountExecutive ?? ""}
            onChange={(e) => update("accountExecutive", e.target.value)}
          />
        </Field>
        <Field label="Owner (you)">
          <TextInput
            placeholder="Your name"
            value={draft.ownerName ?? ""}
            onChange={(e) => update("ownerName", e.target.value)}
          />
        </Field>
        <Field label="Start date">
          <TextInput
            type="date"
            value={draft.startDate ?? ""}
            onChange={(e) => update("startDate", e.target.value)}
          />
        </Field>
        <Field label="Funded date">
          <TextInput
            type="date"
            value={draft.fundedDate ?? ""}
            onChange={(e) => update("fundedDate", e.target.value)}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

/* ------------------------------ Borrowers ------------------------------ */

export function BorrowersSection({ draft, update }: SectionProps) {
  const borrowers = draft.borrowers ?? [];

  function setBorrower(i: number, patch: Partial<(typeof borrowers)[number]>) {
    const next = borrowers.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    update("borrowers", next);
  }
  function addBorrower() {
    update("borrowers", [...borrowers, {}]);
  }
  function removeBorrower(i: number) {
    update(
      "borrowers",
      borrowers.filter((_, idx) => idx !== i),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {borrowers.map((b, i) => (
        <SectionCard
          key={i}
          title={`Borrower ${i + 1}`}
          description="Contact, identity, and current employment."
          actions={
            borrowers.length > 1 ? (
              <Button variant="ghost" onClick={() => removeBorrower(i)}>
                Remove
              </Button>
            ) : null
          }
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="First name">
              <TextInput
                value={b.firstName ?? ""}
                onChange={(e) => setBorrower(i, { firstName: e.target.value })}
              />
            </Field>
            <Field label="Middle">
              <TextInput
                value={b.middleName ?? ""}
                onChange={(e) => setBorrower(i, { middleName: e.target.value })}
              />
            </Field>
            <Field label="Last name">
              <TextInput
                value={b.lastName ?? ""}
                onChange={(e) => setBorrower(i, { lastName: e.target.value })}
              />
            </Field>
            <Field label="Years in school">
              <TextInput
                value={b.yearsInSchool ?? ""}
                onChange={(e) => setBorrower(i, { yearsInSchool: e.target.value })}
              />
            </Field>
            <Field label="FICO">
              <TextInput
                value={b.fico ?? ""}
                onChange={(e) => setBorrower(i, { fico: e.target.value })}
              />
            </Field>
            <Field label="Best time to contact">
              <TextInput
                value={b.bestTime ?? ""}
                onChange={(e) => setBorrower(i, { bestTime: e.target.value })}
              />
            </Field>
            <Field label="Mobile">
              <TextInput
                value={b.mobile ?? ""}
                onChange={(e) => setBorrower(i, { mobile: e.target.value })}
              />
            </Field>
            <Field label="Home phone">
              <TextInput
                value={b.homePhone ?? ""}
                onChange={(e) => setBorrower(i, { homePhone: e.target.value })}
              />
            </Field>
            <Field label="Other phone / fax">
              <TextInput
                value={b.altPhone ?? ""}
                onChange={(e) => setBorrower(i, { altPhone: e.target.value })}
              />
            </Field>
            <Field label="Email" className="md:col-span-2">
              <TextInput
                type="email"
                value={b.email ?? ""}
                onChange={(e) => setBorrower(i, { email: e.target.value })}
              />
            </Field>
            <Field label="SSN">
              <TextInput
                value={b.ssn ?? ""}
                onChange={(e) => setBorrower(i, { ssn: e.target.value })}
              />
            </Field>
            <Field label="DOB">
              <TextInput
                type="date"
                value={b.dob ?? ""}
                onChange={(e) => setBorrower(i, { dob: e.target.value })}
              />
            </Field>
            <Field label="Employer">
              <TextInput
                value={b.employerName ?? ""}
                onChange={(e) => setBorrower(i, { employerName: e.target.value })}
              />
            </Field>
            <Field label="Employer phone">
              <TextInput
                value={b.employerPhone ?? ""}
                onChange={(e) => setBorrower(i, { employerPhone: e.target.value })}
              />
            </Field>
            <Field label="Tenure">
              <TextInput
                value={b.employerTenure ?? ""}
                onChange={(e) => setBorrower(i, { employerTenure: e.target.value })}
              />
            </Field>
            <Field label="Position">
              <TextInput
                value={b.position ?? ""}
                onChange={(e) => setBorrower(i, { position: e.target.value })}
              />
            </Field>
          </div>
        </SectionCard>
      ))}
      <Button variant="secondary" onClick={addBorrower}>
        + Add borrower
      </Button>
    </div>
  );
}

/* ------------------------------ Property ------------------------------ */

function PropertyFields({
  value,
  onChange,
}: {
  value: NonNullable<Sheet["subjectProperty"]>;
  onChange: (next: NonNullable<Sheet["subjectProperty"]>) => void;
}) {
  function set<K extends keyof typeof value>(k: K, v: (typeof value)[K]) {
    onChange({ ...value, [k]: v });
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Field label="Street address" className="lg:col-span-3">
        <TextInput value={value.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="City">
        <TextInput value={value.city ?? ""} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <Field label="State">
        <TextInput value={value.state ?? ""} onChange={(e) => set("state", e.target.value)} />
      </Field>
      <Field label="ZIP">
        <TextInput value={value.zip ?? ""} onChange={(e) => set("zip", e.target.value)} />
      </Field>
      <Field label="Estimated value ($)">
        <TextInput value={value.estimatedValue ?? ""} onChange={(e) => set("estimatedValue", e.target.value)} />
      </Field>
      <Field label="Est. current mortgage balance ($)">
        <TextInput
          value={value.estCurrentMortgageBalance ?? ""}
          onChange={(e) => set("estCurrentMortgageBalance", e.target.value)}
        />
      </Field>
      <Field label="Time in house">
        <TextInput value={value.timeInHouse ?? ""} onChange={(e) => set("timeInHouse", e.target.value)} />
      </Field>
      <Field label="Sq ft">
        <TextInput value={value.sqFt ?? ""} onChange={(e) => set("sqFt", e.target.value)} />
      </Field>
      <Field label="Lot sq ft">
        <TextInput value={value.lotSqFt ?? ""} onChange={(e) => set("lotSqFt", e.target.value)} />
      </Field>
      <Field label="Year built">
        <TextInput value={value.yearBuilt ?? ""} onChange={(e) => set("yearBuilt", e.target.value)} />
      </Field>
    </div>
  );
}

export function PropertySection({ draft, update }: SectionProps) {
  const d = deriveIntake(draft);
  const breakdown = [
    d.reoCounts.primary && `${d.reoCounts.primary} Primary`,
    d.reoCounts.secondHome && `${d.reoCounts.secondHome} 2nd Home`,
    d.reoCounts.rental && `${d.reoCounts.rental} Rental`,
    d.reoCounts.commercial && `${d.reoCounts.commercial} Commercial`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Occupancy">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Field label="Occupancy">
            <Select
              value={draft.occupancy ?? ""}
              onChange={(e) => update("occupancy", e.target.value)}
            >
              <option value="">Select…</option>
              <option>Primary</option>
              <option>Investment</option>
              <option>2nd Home</option>
              <option>Other</option>
            </Select>
          </Field>
          {draft.occupancy === "Other" ? (
            <Field label="Other (describe)">
              <TextInput
                value={draft.occupancyOther ?? ""}
                onChange={(e) => update("occupancyOther", e.target.value)}
              />
            </Field>
          ) : null}
          <LinkedField
            label="Total properties owned"
            value={draft.propertiesOwned ?? ""}
            linkedValue={d.reoCounts.total > 0 ? String(d.reoCounts.total) : ""}
            linkedFrom="Schedule of REO"
            onChange={(v) => update("propertiesOwned", v)}
            hint={breakdown || undefined}
          />
        </div>
      </SectionCard>

      <SectionCard title="Subject property">
        <PropertyFields
          value={draft.subjectProperty ?? {}}
          onChange={(v) => update("subjectProperty", v)}
        />
      </SectionCard>

      <SectionCard
        title="Primary residence"
        description="Skip if the subject property is the primary residence."
      >
        <PropertyFields
          value={draft.primaryProperty ?? {}}
          onChange={(v) => update("primaryProperty", v)}
        />
      </SectionCard>
    </div>
  );
}

/* ------------------------------ Loans ------------------------------ */

export function LoansSection({ draft, update }: SectionProps) {
  const loans = draft.loans ?? [];

  function setLoan(i: number, patch: Partial<(typeof loans)[number]>) {
    update("loans", loans.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLoan() {
    update("loans", [...loans, { position: "Other" }]);
  }
  function removeLoan(i: number) {
    update("loans", loans.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Borrower flags & hardship">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Citizenship">
            <Select
              value={draft.citizenship ?? ""}
              onChange={(e) => update("citizenship", e.target.value)}
            >
              <option value="">Select…</option>
              <option>US Citizen</option>
              <option>Permanent Resident</option>
              <option>Foreign National</option>
            </Select>
          </Field>
          <Field label="Default on any judgments?">
            <Select
              value={draft.defaultJudgments ?? ""}
              onChange={(e) => update("defaultJudgments", e.target.value)}
            >
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
          <Field label="BK / foreclosure history">
            <Select
              value={draft.bkHistory ?? ""}
              onChange={(e) => update("bkHistory", e.target.value)}
            >
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
          <Field label="If yes, date">
            <TextInput
              type="date"
              value={draft.bkDate ?? ""}
              onChange={(e) => update("bkDate", e.target.value)}
            />
          </Field>
          <Field label="Late payments in last 12 months?" className="md:col-span-2">
            <Select
              value={draft.latePaymentsLast12 ?? ""}
              onChange={(e) => update("latePaymentsLast12", e.target.value)}
            >
              <option value="">—</option>
              <option>No</option>
              <option>Yes</option>
            </Select>
          </Field>
        </div>
      </SectionCard>

      {loans.map((l, i) => (
        <SectionCard
          key={i}
          title={`${l.position ?? "Loan"} mortgage`}
          actions={
            <Button variant="ghost" onClick={() => removeLoan(i)}>
              Remove
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Position">
              <Select
                value={l.position ?? ""}
                onChange={(e) => setLoan(i, { position: e.target.value })}
              >
                <option value="">—</option>
                <option>1st</option>
                <option>2nd</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label="Lender name" className="md:col-span-2">
              <TextInput value={l.lenderName ?? ""} onChange={(e) => setLoan(i, { lenderName: e.target.value })} />
            </Field>
            <Field label="Loan number">
              <TextInput value={l.loanNumber ?? ""} onChange={(e) => setLoan(i, { loanNumber: e.target.value })} />
            </Field>
            <Field label="Purpose">
              <Select value={l.purpose ?? ""} onChange={(e) => setLoan(i, { purpose: e.target.value })}>
                <option value="">—</option>
                <option>Purchase</option>
                <option>Rate / Term</option>
                <option>Cash-Out</option>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={l.type ?? ""} onChange={(e) => setLoan(i, { type: e.target.value })}>
                <option value="">—</option>
                <option>FHA</option>
                <option>Conventional</option>
                <option>VA</option>
                <option>USDA</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label="Date acquired">
              <TextInput
                type="date"
                value={l.dateAcquired ?? ""}
                onChange={(e) => setLoan(i, { dateAcquired: e.target.value })}
              />
            </Field>
            <Field label="Before May 2009?">
              <Select
                value={l.beforeMay2009 ?? ""}
                onChange={(e) => setLoan(i, { beforeMay2009: e.target.value })}
              >
                <option value="">—</option>
                <option>Before 2009</option>
                <option>After 2009</option>
              </Select>
            </Field>
            <Field label="Current P&I ($)">
              <TextInput value={l.currentPI ?? ""} onChange={(e) => setLoan(i, { currentPI: e.target.value })} />
            </Field>
            <Field label="Current balance ($)">
              <TextInput value={l.currentBalance ?? ""} onChange={(e) => setLoan(i, { currentBalance: e.target.value })} />
            </Field>
            <Field label="Original funding amount ($)">
              <TextInput value={l.originalAmount ?? ""} onChange={(e) => setLoan(i, { originalAmount: e.target.value })} />
            </Field>
            <Field label="Current rate (%)">
              <TextInput value={l.currentRate ?? ""} onChange={(e) => setLoan(i, { currentRate: e.target.value })} />
            </Field>
            <Field label="Rate type">
              <Select value={l.rateType ?? ""} onChange={(e) => setLoan(i, { rateType: e.target.value })}>
                <option value="">—</option>
                <option>Fixed</option>
                <option>ARM</option>
                <option>I/O</option>
                <option>NegAm</option>
              </Select>
            </Field>
            <Field label="PITIA ($)">
              <TextInput value={l.pitia ?? ""} onChange={(e) => setLoan(i, { pitia: e.target.value })} />
            </Field>
            <Field label="Taxes / mo ($)">
              <TextInput value={l.taxes ?? ""} onChange={(e) => setLoan(i, { taxes: e.target.value })} />
            </Field>
            <Field label="Insurance / mo ($)">
              <TextInput value={l.insurance ?? ""} onChange={(e) => setLoan(i, { insurance: e.target.value })} />
            </Field>
            <Field label="HOA / mo ($)">
              <TextInput value={l.hoa ?? ""} onChange={(e) => setLoan(i, { hoa: e.target.value })} />
            </Field>
            <Field label="PMI / mo ($)">
              <TextInput value={l.pmi ?? ""} onChange={(e) => setLoan(i, { pmi: e.target.value })} />
            </Field>
            <Field label="Impounds">
              <Select value={l.impounds ?? ""} onChange={(e) => setLoan(i, { impounds: e.target.value })}>
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </Select>
            </Field>
            <Field label="Notes" className="lg:col-span-3">
              <TextArea value={l.notes ?? ""} onChange={(e) => setLoan(i, { notes: e.target.value })} />
            </Field>
          </div>
        </SectionCard>
      ))}

      <Button variant="secondary" onClick={addLoan}>
        + Add additional loan
      </Button>
    </div>
  );
}

/* ------------------------------ Income ------------------------------ */

export function IncomeSection({ draft, update }: SectionProps) {
  const rows = useMemo(() => draft.incomeRows ?? [], [draft.incomeRows]);

  function setRow(i: number, patch: Partial<(typeof rows)[number]>) {
    update("incomeRows", rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    update("incomeRows", [...rows, { borrower: "Borrower 1", source: "W2" }]);
  }
  function remove(i: number) {
    update("incomeRows", rows.filter((_, idx) => idx !== i));
  }

  const total = useMemo(() => sumIncomeRowsMonthly(rows), [rows]);

  return (
    <SectionCard
      title="Monthly income"
      description="Add a row per income stream per borrower (gross, before taxes)."
      actions={
        <span className="text-sm text-muted-foreground">
          Total: <strong>${total.toLocaleString()}</strong> / mo
        </span>
      }
    >
      <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3">Borrower</th>
              <th className="px-3">Source</th>
              <th className="px-3">Description</th>
              <th className="px-3">Monthly $</th>
              <th className="px-3">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="bg-muted/50">
                <td className="rounded-l-lg px-2">
                  <Select
                    value={r.borrower ?? ""}
                    onChange={(e) => setRow(i, { borrower: e.target.value })}
                  >
                    <option>Borrower 1</option>
                    <option>Borrower 2</option>
                    <option>Other</option>
                  </Select>
                </td>
                <td className="px-2">
                  <Select value={r.source ?? ""} onChange={(e) => setRow(i, { source: e.target.value })}>
                    <option value="">—</option>
                    <option>W2</option>
                    <option>Self-Employed</option>
                    <option>1099 / Contract</option>
                    <option>Retirement</option>
                    <option>Rental</option>
                    <option>Child / Alimony</option>
                    <option>Other</option>
                  </Select>
                </td>
                <td className="px-2">
                  <TextInput value={r.description ?? ""} onChange={(e) => setRow(i, { description: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.monthlyAmount ?? ""} onChange={(e) => setRow(i, { monthlyAmount: e.target.value })} />
                </td>
                <td className="px-2">
                  <TextInput value={r.notes ?? ""} onChange={(e) => setRow(i, { notes: e.target.value })} />
                </td>
                <td className="rounded-r-lg px-2 text-right">
                  <Button variant="ghost" onClick={() => remove(i)}>
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" className="mt-3" onClick={add}>
        + Add income row
      </Button>
    </SectionCard>
  );
}

/* ------------------------------ Assets & Liabilities ------------------------------ */

export function AssetsSection({ draft, update }: SectionProps) {
  const assets = useMemo(() => draft.assets ?? [], [draft.assets]);
  const liabs = useMemo(() => draft.liabilities ?? [], [draft.liabilities]);

  function setAsset(i: number, patch: Partial<(typeof assets)[number]>) {
    update("assets", assets.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function setLiab(i: number, patch: Partial<(typeof liabs)[number]>) {
    update("liabilities", liabs.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  const assetTotal = useMemo(() => sumAssetsEstimatedValue(assets), [assets]);
  const liabBalanceTotal = useMemo(() => sumLiabilitiesBalances(liabs), [liabs]);
  const liabMonthlyTotal = useMemo(
    () => sumLiabilitiesMonthlyPayments(liabs),
    [liabs],
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Assets"
        actions={
          <span className="text-sm text-muted-foreground">
            Total: <strong>${assetTotal.toLocaleString()}</strong>
          </span>
        }
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[600px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3">Description</th>
                <th className="px-3">Estimated value</th>
                <th className="px-3">Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => (
                <tr key={i} className="bg-muted/50">
                  <td className="rounded-l-lg px-2">
                    <TextInput value={a.description ?? ""} onChange={(e) => setAsset(i, { description: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={a.estimatedValue ?? ""} onChange={(e) => setAsset(i, { estimatedValue: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={a.notes ?? ""} onChange={(e) => setAsset(i, { notes: e.target.value })} />
                  </td>
                  <td className="rounded-r-lg px-2 text-right">
                    <Button
                      variant="ghost"
                      onClick={() => update("assets", assets.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="secondary" className="mt-3" onClick={() => update("assets", [...assets, {}])}>
          + Add asset
        </Button>
      </SectionCard>

      <SectionCard
        title="Liabilities"
        actions={
          <span className="text-sm text-muted-foreground">
            Monthly: <strong>${liabMonthlyTotal.toLocaleString()}</strong> · Balance:{" "}
            <strong>${liabBalanceTotal.toLocaleString()}</strong>
          </span>
        }
      >
        <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[700px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3">Description</th>
                <th className="px-3">Monthly payment</th>
                <th className="px-3">Balance / limit</th>
                <th className="px-3">Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liabs.map((a, i) => (
                <tr key={i} className="bg-muted/50">
                  <td className="rounded-l-lg px-2">
                    <TextInput value={a.description ?? ""} onChange={(e) => setLiab(i, { description: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={a.monthlyPayment ?? ""} onChange={(e) => setLiab(i, { monthlyPayment: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={a.balance ?? ""} onChange={(e) => setLiab(i, { balance: e.target.value })} />
                  </td>
                  <td className="px-2">
                    <TextInput value={a.notes ?? ""} onChange={(e) => setLiab(i, { notes: e.target.value })} />
                  </td>
                  <td className="rounded-r-lg px-2 text-right">
                    <Button
                      variant="ghost"
                      onClick={() => update("liabilities", liabs.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="secondary" className="mt-3" onClick={() => update("liabilities", [...liabs, {}])}>
          + Add liability
        </Button>
      </SectionCard>
    </div>
  );
}

/* ------------------------------ Household ------------------------------ */

export function HouseholdSection({ draft, update }: SectionProps) {
  return (
    <SectionCard title="Household">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Number of dependents">
          <TextInput
            value={draft.dependentsCount ?? ""}
            onChange={(e) => update("dependentsCount", e.target.value)}
          />
        </Field>
        <Field label="Ages (comma separated)">
          <TextInput
            value={draft.dependentsAges ?? ""}
            onChange={(e) => update("dependentsAges", e.target.value)}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

/* ------------------------------ Workflow ------------------------------ */

export function WorkflowSection({ draft, update }: SectionProps) {
  const items = draft.workflow ?? [];

  function setItem(i: number, patch: Partial<(typeof items)[number]>) {
    update("workflow", items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function add() {
    update("workflow", [...items, { label: "New step", done: false }]);
  }

  return (
    <SectionCard
      title="Workflow checklist"
      description="Mark each milestone complete and stamp the date."
    >
      <ul className="flex flex-col divide-y divide-border">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-3 md:py-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(it.done)}
                onChange={(e) =>
                  setItem(i, {
                    done: e.target.checked,
                    date: e.target.checked && !it.date ? new Date().toISOString().slice(0, 10) : it.date,
                  })
                }
                className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary"
              />
              <input
                type="text"
                value={it.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 pl-7 sm:pl-0">
              <input
                type="date"
                value={it.date ?? ""}
                onChange={(e) => setItem(i, { date: e.target.value })}
                className="min-w-0 max-w-full rounded-md border border-border/80 bg-background px-2 py-1 text-xs text-foreground"
              />
              <Button
                variant="ghost"
                className="shrink-0"
                onClick={() => update("workflow", items.filter((_, idx) => idx !== i))}
              >
                ×
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="mt-4" onClick={add}>
        + Add step
      </Button>
    </SectionCard>
  );
}

/* ------------------------------ Notes ------------------------------ */

export function NotesSection({ draft, update }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Primary objective from consumer"
        description="What outcome are they trying to achieve?"
      >
        <TextArea
          value={draft.primaryObjective ?? ""}
          onChange={(e) => update("primaryObjective", e.target.value)}
        />
      </SectionCard>
      <SectionCard title="Additional file notes">
        <TextArea
          value={draft.additionalNotes ?? ""}
          onChange={(e) => update("additionalNotes", e.target.value)}
        />
      </SectionCard>
    </div>
  );
}
