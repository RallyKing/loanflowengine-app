"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  FileText,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import type { LenderLinkMeta } from "@/components/pipeline/blocks/LenderSummaryBlock";
import {
  LenderSearchPanel,
  type LenderSearchOrgArgs,
} from "@/modules/pipeline/components/blocks/LenderSearchPanel";

/** Phase Modular-B â€” roles assignable from the block (lead/declined have dedicated flows). */
export type FileLenderAssignableRole =
  | "quoted"
  | "submitted"
  | "syndication_partner"
  | "sub_lender"
  | "partner_group"
  | "other";

const ASSIGNABLE_ROLE_OPTIONS: ReadonlyArray<{
  id: FileLenderAssignableRole;
  label: string;
}> = [
  { id: "quoted", label: "Quoted" },
  { id: "submitted", label: "Submitted" },
  { id: "syndication_partner", label: "Syndication partner" },
  { id: "sub_lender", label: "Sub-lender" },
  { id: "partner_group", label: "Partner group" },
  { id: "other", label: "Other" },
];

/** Lender rep picker â€” loads reps linked to the institution via CRM. */
function LenderRepSelect({
  lenderId,
  contactRepId,
  readOnly,
  onSetRep,
}: {
  lenderId: Id<"lenders">;
  contactRepId?: Id<"contacts">;
  readOnly?: boolean;
  onSetRep?: (contactRepId: Id<"contacts"> | null) => void;
}) {
  const reps = useQuery(api.contactLenderLinks.listByLenderWithContacts, {
    lenderId,
  });

  if (!onSetRep || readOnly) {
    if (!contactRepId) return null;
    const name =
      reps?.find((r) => r.contact?._id === contactRepId)?.contact?.name ??
      "Representative";
    return (
      <p className="text-xs text-muted-foreground">
        Rep: <span className="text-foreground">{name}</span>
      </p>
    );
  }

  return (
    <label className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      Representative
      <select
        className="h-9 min-h-[40px] max-w-[14rem] rounded-dlc-sm border border-border bg-background px-2 text-xs sm:h-8 sm:min-h-0"
        value={contactRepId ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onSetRep(v ? (v as Id<"contacts">) : null);
        }}
        aria-label="Lender representative"
        data-testid="lender-rep-select"
      >
        <option value="">— None —</option>
        {(reps ?? [])
          .filter((r) => r.contact)
          .map((r) => (
            <option key={r.link._id} value={r.contact!._id}>
              {r.contact!.name}
              {r.link.role ? ` (${r.link.role})` : ""}
            </option>
          ))}
      </select>
    </label>
  );
}

export type LenderBoardRole = "primary" | "secondary" | "considering";

const BOARD_ROLE_OPTIONS: ReadonlyArray<{
  id: LenderBoardRole;
  label: string;
}> = [
  { id: "considering", label: "Considering" },
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
];

export type FileLendersBlockProps = {
  fileId: Id<"pipeline">;
  primaryLender?: Doc<"lenders"> | null;
  secondaryLenders: Doc<"lenders">[];
  consideringLenders: Doc<"lenders">[];
  linkByLenderId: Map<string, LenderLinkMeta>;
  readOnly?: boolean;
  lenderOrgArgs: LenderSearchOrgArgs | null;
  attachError: string | null;
  onAttachErrorClear: () => void;
  onAddToConsideration: (payload: {
    lenderId: Id<"lenders">;
    hit: Doc<"lenders">;
  }) => Promise<void>;
  settingBoardRoleId: Id<"lenders"> | null;
  removingFromFileId: Id<"lenders"> | null;
  rejecting: Id<"lenders"> | null;
  restoring: Id<"lenders"> | null;
  clearing: boolean;
  confirmClear: "selected" | "all" | null;
  onConfirmClearChange: (mode: "selected" | "all" | null) => void;
  onSetBoardRole: (lenderId: Id<"lenders">, role: LenderBoardRole) => void;
  onRemoveFromFile: (lenderId: Id<"lenders">) => void;
  onRestoreLender: (lenderId: Id<"lenders">) => void;
  onClearLenders: (keep: "selected" | "none") => void;
  onOpenRejectModal: (lenderId: Id<"lenders">) => void;
  /** Phase Modular-B â€” assign multi-lender relationship roles. */
  onSetLenderRole?: (
    lenderId: Id<"lenders">,
    role: FileLenderAssignableRole,
  ) => void;
  /** Phase Modular-B â€” pick a loan program from the lender's programList. */
  onSetLenderProgram?: (
    lenderId: Id<"lenders">,
    programName: string | null,
  ) => void;
  /** Phase Modular-B â€” suggest applying the lender's task playbook. */
  lenderPlaybookNameById?: Map<string, string>;
  onApplyLenderPlaybook?: (lenderId: Id<"lenders">) => void;
  /** Assign lender representative (contact) on this file. */
  onSetLenderRep?: (
    lenderId: Id<"lenders">,
    contactRepId: Id<"contacts"> | null,
  ) => void;
};

/** Lazy guideline attachment list â€” only queries when expanded. */
function LenderGuidelinesInline({ lenderId }: { lenderId: Id<"lenders"> }) {
  const [open, setOpen] = useState(false);
  const attachments = useQuery(
    api.lenderFiles.list,
    open ? { lenderId } : "skip",
  );

  return (
    <div>
      <button
        type="button"
        className="inline-flex min-h-[40px] items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground sm:min-h-0"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="lender-guidelines-toggle"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        Guidelines & docs
      </button>
      {open ? (
        attachments === undefined ? (
          <p className="mt-0.5 text-xs text-muted-foreground" role="status">
            Loading…
          </p>
        ) : attachments.length === 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            No guideline documents on this lender yet. Upload them from the
            lender drawer.
          </p>
        ) : (
          <ul className="mt-0.5 space-y-0.5">
            {attachments.map((a) => (
              <li key={a._id}>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {a.label?.trim() || a.fileName}
                    </span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {a.label?.trim() || a.fileName} (unavailable)
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function FileLendersBlock({
  fileId,
  primaryLender,
  secondaryLenders,
  consideringLenders,
  linkByLenderId,
  readOnly = false,
  lenderOrgArgs,
  attachError,
  onAttachErrorClear,
  onAddToConsideration,
  settingBoardRoleId,
  removingFromFileId,
  rejecting,
  restoring,
  clearing,
  confirmClear,
  onConfirmClearChange,
  onSetBoardRole,
  onRemoveFromFile,
  onRestoreLender,
  onClearLenders,
  onOpenRejectModal,
  onSetLenderRole,
  onSetLenderProgram,
  lenderPlaybookNameById,
  onApplyLenderPlaybook,
  onSetLenderRep,
}: FileLendersBlockProps) {
  const narrow = useNarrowViewport();
  const [mobileLenderPanel, setMobileLenderPanel] = useState<
    "find" | "onFile"
  >("find");

  const lenderCount =
    (primaryLender ? 1 : 0) +
    secondaryLenders.length +
    consideringLenders.length;

  useEffect(() => {
    if (!narrow) return;
    if (lenderCount === 0) setMobileLenderPanel("find");
  }, [narrow, lenderCount]);

  const attachedLenderIds = useMemo(() => {
    const ids = new Set<Id<"lenders">>();
    if (primaryLender) ids.add(primaryLender._id);
    for (const l of secondaryLenders) ids.add(l._id);
    for (const l of consideringLenders) ids.add(l._id);
    return ids;
  }, [primaryLender, secondaryLenders, consideringLenders]);

  const roleLabel = (role: LenderBoardRole) => {
    if (role === "primary") return "Primary";
    if (role === "secondary") return "Secondary";
    return "Considering";
  };

  const rowSurface = (role: LenderBoardRole) => {
    if (role === "primary") {
      return "dlc-surface-raised border-primary/50 bg-primary/5 ring-1 ring-primary/25";
    }
    if (role === "secondary") {
      return "border-border/80 bg-muted/25";
    }
    return "border-border/60 bg-muted/10";
  };

  const renderBoardRow = (
    l: Doc<"lenders">,
    boardRole: LenderBoardRole,
  ) => {
    const lenderLink = linkByLenderId.get(String(l._id));
    const isDeclined = lenderLink?.relationshipType === "declined";
    const declineReason = lenderLink?.rejectionReason;
    const chosenProgram = (l.programList ?? []).find(
      (prog) => prog.name === lenderLink?.selectedProgramName,
    );

    return (
      <li
        key={l._id}
        className={cn(
          "rounded-dlc-sm border px-2.5 py-2",
          rowSurface(boardRole),
        )}
        data-testid={`lender-board-row-${l._id}`}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {l.company || "—"}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                boardRole === "primary"
                  ? "border border-primary/40 bg-primary/15 text-primary"
                  : boardRole === "secondary"
                    ? "bg-muted text-muted-foreground"
                    : "border border-dashed border-border bg-background text-muted-foreground",
              )}
            >
              {roleLabel(boardRole)}
            </span>
            {isDeclined ? (
              <span
                className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                title={declineReason ? `Reason: ${declineReason}` : undefined}
              >
                Rejected
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {!readOnly ? (
              <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="sr-only sm:not-sr-only">Board</span>
                <select
                  className="h-9 min-h-[40px] max-w-[9.5rem] rounded-dlc-sm border border-border bg-background px-2 text-xs sm:h-8 sm:min-h-0"
                  value={boardRole}
                  disabled={settingBoardRoleId === l._id}
                  onChange={(e) =>
                    onSetBoardRole(
                      l._id,
                      e.currentTarget.value as LenderBoardRole,
                    )
                  }
                  aria-label={`Board role for ${l.company || "lender"}`}
                  data-testid={`lender-board-role-${l._id}`}
                >
                  {BOARD_ROLE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {isDeclined && !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-[40px] shrink-0 px-2 text-xs sm:h-8 sm:min-h-0"
                disabled={restoring === l._id}
                onClick={() => void onRestoreLender(l._id)}
              >
                {restoring === l._id ? "Restoring…" : "Bring Back"}
              </Button>
            ) : null}
            {!isDeclined && !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="h-9 min-h-[40px] shrink-0 px-2 text-xs sm:h-8 sm:min-h-0"
                disabled={rejecting === l._id}
                onClick={() => onOpenRejectModal(l._id)}
              >
                Rejected
              </Button>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                className="inline-flex h-9 w-9 min-h-[40px] min-w-[40px] items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted hover:text-destructive sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0"
                disabled={removingFromFileId === l._id}
                onClick={() => onRemoveFromFile(l._id)}
                aria-label={`Remove ${l.company || "lender"} from file`}
                data-testid={`lender-remove-from-file-${l._id}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {isDeclined && declineReason ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Reason:</span>{" "}
            {declineReason}
          </p>
        ) : null}

        {(l.contactName || l.phone || l.email) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {l.contactName ? (
              <span className="font-medium text-foreground">{l.contactName}</span>
            ) : null}
            {l.phone ? <span>{l.phone}</span> : null}
            {l.email ? <span className="truncate">{l.email}</span> : null}
          </div>
        )}

        {!isDeclined ? (
          <div className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <LenderRepSelect
                lenderId={l._id}
                contactRepId={lenderLink?.contactRepId}
                readOnly={readOnly}
                onSetRep={
                  onSetLenderRep
                    ? (repId) => onSetLenderRep(l._id, repId)
                    : undefined
                }
              />
              {onSetLenderRole && !readOnly ? (
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Role
                  <select
                    className="h-9 min-h-[40px] rounded-dlc-sm border border-border bg-background px-2 text-xs sm:h-8 sm:min-h-0"
                    value={
                      ASSIGNABLE_ROLE_OPTIONS.some(
                        (o) => o.id === lenderLink?.relationshipType,
                      )
                        ? (lenderLink?.relationshipType as FileLenderAssignableRole)
                        : "quoted"
                    }
                    onChange={(e) =>
                      onSetLenderRole(
                        l._id,
                        e.currentTarget.value as FileLenderAssignableRole,
                      )
                    }
                    aria-label={`Relationship role for ${l.company || "lender"}`}
                    data-testid="lender-role-select"
                  >
                    {ASSIGNABLE_ROLE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {onSetLenderProgram &&
              (l.programList?.length ?? 0) > 0 &&
              !readOnly ? (
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Program
                  <select
                    className="h-9 min-h-[40px] max-w-[14rem] rounded-dlc-sm border border-border bg-background px-2 text-xs sm:h-8 sm:min-h-0"
                    value={lenderLink?.selectedProgramName ?? ""}
                    onChange={(e) =>
                      onSetLenderProgram(
                        l._id,
                        e.currentTarget.value || null,
                      )
                    }
                    aria-label={`Loan program for ${l.company || "lender"} on this file`}
                    data-testid="lender-program-select"
                  >
                    <option value="">No program chosen</option>
                    {(l.programList ?? []).map((prog) => (
                      <option key={prog.name} value={prog.name}>
                        {prog.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : lenderLink?.selectedProgramName ? (
                <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Program: {lenderLink.selectedProgramName}
                </span>
              ) : null}
            </div>

            {chosenProgram ? (
              <div
                className="rounded-dlc-sm bg-muted/30 px-2 py-1 text-xs text-muted-foreground"
                data-testid="lender-program-details"
              >
                <span className="font-medium text-foreground/80">
                  {chosenProgram.name}
                </span>
                {chosenProgram.minFico ? (
                  <span> · Min FICO {chosenProgram.minFico}</span>
                ) : null}
                {chosenProgram.requirements ? (
                  <p className="mt-0.5 whitespace-pre-wrap">
                    {chosenProgram.requirements}
                  </p>
                ) : null}
              </div>
            ) : null}

            <LenderGuidelinesInline lenderId={l._id} />

            {onApplyLenderPlaybook &&
            lenderPlaybookNameById?.get(String(l._id)) &&
            !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-[40px] px-2 text-xs sm:h-7 sm:min-h-0"
                onClick={() => onApplyLenderPlaybook(l._id)}
                data-testid="lender-playbook-apply"
              >
                Apply “{lenderPlaybookNameById.get(String(l._id))}” task
                playbook
              </Button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const renderBoardSection = (
    title: string,
    lenders: Doc<"lenders">[],
    role: LenderBoardRole,
    testId?: string,
  ) => {
    if (lenders.length === 0) return null;
    return (
      <section aria-label={title}>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({lenders.length})
        </h4>
        <ul className="space-y-1.5" data-testid={testId}>
          {lenders.map((l) => renderBoardRow(l, role))}
        </ul>
      </section>
    );
  };

  const nonPrimaryCount = secondaryLenders.length + consideringLenders.length;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {lenderCount > 0 && !readOnly ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1">
          {confirmClear ? (
            <>
              <span className="text-xs text-muted-foreground">
                {confirmClear === "selected"
                  ? `Remove all non-primary lenders (${nonPrimaryCount})?`
                  : `Remove all ${lenderCount} lenders?`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="h-9 min-h-[40px] sm:h-8 sm:min-h-0"
                disabled={clearing}
                onClick={() =>
                  onClearLenders(
                    confirmClear === "selected" ? "selected" : "none",
                  )
                }
              >
                {clearing ? "Clearing…" : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-[40px] sm:h-8 sm:min-h-0"
                onClick={() => onConfirmClearChange(null)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {primaryLender && nonPrimaryCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 min-h-[40px] sm:h-8 sm:min-h-0"
                  onClick={() => onConfirmClearChange("selected")}
                  title="Remove every lender except primary"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Clear non-primary
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 min-h-[40px] text-muted-foreground hover:text-destructive sm:h-8 sm:min-h-0"
                onClick={() => onConfirmClearChange("all")}
                title="Remove every lender from this file"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </Button>
            </>
          )}
        </div>
      ) : null}

      {narrow ? (
        <div
          className="flex rounded-dlc-md border border-border/70 bg-muted/25 p-0.5"
          role="tablist"
          aria-label="Lender workflow"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileLenderPanel === "find"}
            className={cn(
              "min-h-[40px] flex-1 rounded-dlc-sm px-2 text-xs font-semibold transition-colors duration-dlc-short ease-dlc-standard",
              mobileLenderPanel === "find"
                ? "bg-background text-foreground shadow-dlc-1"
                : "text-muted-foreground",
            )}
            onClick={() => setMobileLenderPanel("find")}
          >
            Find &amp; add
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileLenderPanel === "onFile"}
            className={cn(
              "min-h-[40px] flex-1 rounded-dlc-sm px-2 text-xs font-semibold transition-colors duration-dlc-short ease-dlc-standard",
              mobileLenderPanel === "onFile"
                ? "bg-background text-foreground shadow-dlc-1"
                : "text-muted-foreground",
            )}
            onClick={() => setMobileLenderPanel("onFile")}
          >
            Lender board ({lenderCount})
          </button>
        </div>
      ) : null}

      <div className={cn(narrow && mobileLenderPanel !== "find" && "hidden")}>
        <LenderSearchPanel
          key="lender-search-panel-stable"
          fileId={fileId}
          readOnly={readOnly}
          attachedLenderIds={attachedLenderIds}
          lenderOrgArgs={lenderOrgArgs}
          attachError={attachError}
          onAttachErrorClear={onAttachErrorClear}
          onAddToConsideration={onAddToConsideration}
        />
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-col gap-2",
          narrow && mobileLenderPanel !== "onFile" && "hidden",
        )}
      >
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Lender board
        </h3>

        {lenderCount === 0 ? (
          <p className="rounded-dlc-sm border border-dashed px-2.5 py-2 text-center text-xs text-muted-foreground">
            No lenders on this file yet. Search above and use + Add to File.
          </p>
        ) : (
          <>
            {renderBoardSection(
              "Primary",
              primaryLender ? [primaryLender] : [],
              "primary",
              "lender-primary-card",
            )}
            {!primaryLender ? (
              <p className="rounded-dlc-sm border border-dashed border-primary/30 bg-primary/5 px-2.5 py-2 text-xs text-muted-foreground">
                No primary lender yet. Promote a lender from Considering or
                Secondary using the board role dropdown.
              </p>
            ) : null}
            {renderBoardSection(
              "Secondary",
              secondaryLenders,
              "secondary",
              "lender-secondary-list",
            )}
            {renderBoardSection(
              "Considering",
              consideringLenders,
              "considering",
              "lender-considering-list",
            )}
          </>
        )}
      </div>
    </div>
  );
}
