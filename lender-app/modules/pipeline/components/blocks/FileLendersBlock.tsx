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
    <label className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      Representative
      <select
        className="h-8 max-w-[14rem] rounded-md border border-border bg-background px-2 text-xs"
        value={contactRepId ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onSetRep(v ? (v as Id<"contacts">) : null);
        }}
        aria-label="Lender representative"
        data-testid="lender-rep-select"
      >
        <option value="">â€” None â€”</option>
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
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
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
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            Loadingâ€¦
          </p>
        ) : attachments.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No guideline documents on this lender yet. Upload them from the
            lender drawer.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
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

  const renderLenderDetails = (
    l: Doc<"lenders">,
    boardRole: LenderBoardRole,
  ) => {
    const lenderLink = linkByLenderId.get(String(l._id));
    const isDeclined = lenderLink?.relationshipType === "declined";
    const declineReason = lenderLink?.rejectionReason;

    return (
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{l.company || "â€”"}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
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
              className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
              title={declineReason ? `Reason: ${declineReason}` : undefined}
            >
              Rejected
            </span>
          ) : null}
        </div>
        {isDeclined && declineReason ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Reason:</span>{" "}
            {declineReason}
          </p>
        ) : null}
        {(l.contactName || l.phone || l.email) && (
          <div className="mt-1 text-sm text-muted-foreground">
            {l.contactName ? (
              <div className="text-foreground">{l.contactName}</div>
            ) : null}
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {l.phone ? <span>{l.phone}</span> : null}
              {l.email ? <span>{l.email}</span> : null}
            </div>
          </div>
        )}

        {!isDeclined ? (
          <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
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
            <div className="flex flex-wrap items-center gap-2">
              {onSetLenderRole && !readOnly ? (
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  Role
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs"
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
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  Program
                  <select
                    className="h-8 max-w-[14rem] rounded-md border border-border bg-background px-2 text-xs"
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
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  Program: {lenderLink.selectedProgramName}
                </span>
              ) : null}
            </div>

            {(() => {
              const chosenProgram = (l.programList ?? []).find(
                (prog) => prog.name === lenderLink?.selectedProgramName,
              );
              if (!chosenProgram) return null;
              return (
                <div
                  className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
                  data-testid="lender-program-details"
                >
                  <span className="font-medium text-foreground/80">
                    {chosenProgram.name}
                  </span>
                  {chosenProgram.minFico ? (
                    <span> Â· Min FICO {chosenProgram.minFico}</span>
                  ) : null}
                  {chosenProgram.requirements ? (
                    <p className="mt-0.5 whitespace-pre-wrap">
                      {chosenProgram.requirements}
                    </p>
                  ) : null}
                </div>
              );
            })()}

            <LenderGuidelinesInline lenderId={l._id} />

            {onApplyLenderPlaybook &&
            lenderPlaybookNameById?.get(String(l._id)) &&
            !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onApplyLenderPlaybook(l._id)}
                data-testid="lender-playbook-apply"
              >
                Apply â€œ{lenderPlaybookNameById.get(String(l._id))}â€ task
                playbook
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderBoardRow = (
    l: Doc<"lenders">,
    boardRole: LenderBoardRole,
  ) => {
    const lenderLink = linkByLenderId.get(String(l._id));
    const isDeclined = lenderLink?.relationshipType === "declined";

    return (
      <li
        key={l._id}
        className={cn(
          "flex items-start justify-between gap-3 rounded-md border p-3",
          rowSurface(boardRole),
        )}
        data-testid={`lender-board-row-${l._id}`}
      >
        {renderLenderDetails(l, boardRole)}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!readOnly ? (
            <label className="inline-flex flex-col items-end gap-1 text-xs text-muted-foreground">
              Board role
              <select
                className="h-8 max-w-[10rem] rounded-md border border-border bg-background px-2 text-xs"
                value={boardRole}
                disabled={settingBoardRoleId === l._id}
                onChange={(e) =>
                  onSetBoardRole(l._id, e.currentTarget.value as LenderBoardRole)
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
          <div className="flex flex-wrap items-center justify-end gap-1">
            {isDeclined && !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[40px] shrink-0 sm:min-h-0"
                disabled={restoring === l._id}
                onClick={() => void onRestoreLender(l._id)}
              >
                {restoring === l._id ? "Restoringâ€¦" : "Bring Back"}
              </Button>
            ) : null}
            {!isDeclined && !readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="min-h-[40px] shrink-0 sm:min-h-0"
                disabled={rejecting === l._id}
                onClick={() => onOpenRejectModal(l._id)}
              >
                Rejected
              </Button>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
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
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({lenders.length})
        </h4>
        <ul className="space-y-2" data-testid={testId}>
          {lenders.map((l) => renderBoardRow(l, role))}
        </ul>
      </section>
    );
  };

  const nonPrimaryCount = secondaryLenders.length + consideringLenders.length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {lenderCount > 0 && !readOnly ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5">
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
                disabled={clearing}
                onClick={() =>
                  onClearLenders(
                    confirmClear === "selected" ? "selected" : "none",
                  )
                }
              >
                {clearing ? "Clearingâ€¦" : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
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
                className="text-muted-foreground hover:text-destructive"
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
          className="flex rounded-xl border border-border/70 bg-muted/25 p-1"
          role="tablist"
          aria-label="Lender workflow"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileLenderPanel === "find"}
            className={cn(
              "min-h-[44px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors",
              mobileLenderPanel === "find"
                ? "bg-background text-foreground shadow-sm"
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
              "min-h-[44px] flex-1 rounded-lg px-2 text-xs font-semibold transition-colors",
              mobileLenderPanel === "onFile"
                ? "bg-background text-foreground shadow-sm"
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
          "flex min-w-0 flex-col gap-4",
          narrow && mobileLenderPanel !== "onFile" && "hidden",
        )}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lender board
        </h3>

        {lenderCount === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
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
              <p className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
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
