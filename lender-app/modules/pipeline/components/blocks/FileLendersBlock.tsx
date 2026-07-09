"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  FileText,
  Star,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { SearchField } from "@/components/ui/SearchField";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import type { LenderLinkMeta } from "@/components/pipeline/blocks/LenderSummaryBlock";

/** Phase Modular-B — roles assignable from the block (lead/declined have dedicated flows). */
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

/** Lender rep picker — loads reps linked to the institution via CRM. */
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

export type FileLendersBlockProps = {
  lenders: Doc<"lenders">[];
  selectedLenderId?: Id<"lenders"> | null;
  linkByLenderId: Map<string, LenderLinkMeta>;
  readOnly?: boolean;
  searchHits: Doc<"lenders">[] | undefined;
  lenderSearch: string;
  onLenderSearchChange: (value: string) => void;
  attaching: Id<"lenders"> | null;
  attachError: string | null;
  onAttachErrorClear: () => void;
  detaching: Id<"lenders"> | null;
  selecting: Id<"lenders"> | null;
  rejecting: Id<"lenders"> | null;
  restoring: Id<"lenders"> | null;
  clearing: boolean;
  confirmClear: "selected" | "all" | null;
  onConfirmClearChange: (mode: "selected" | "all" | null) => void;
  onAttachLender: (lenderId: Id<"lenders">) => void;
  onDetachLender: (lenderId: Id<"lenders">) => void;
  onSelectLender: (lenderId: Id<"lenders"> | null) => void;
  onRestoreLender: (lenderId: Id<"lenders">) => void;
  onClearLenders: (keep: "selected" | "none") => void;
  onOpenRejectModal: (lenderId: Id<"lenders">) => void;
  /** Phase Modular-B — assign multi-lender relationship roles. */
  onSetLenderRole?: (
    lenderId: Id<"lenders">,
    role: FileLenderAssignableRole,
  ) => void;
  /** Phase Modular-B — pick a loan program from the lender's programList. */
  onSetLenderProgram?: (
    lenderId: Id<"lenders">,
    programName: string | null,
  ) => void;
  /** Phase Modular-B — suggest applying the lender's task playbook. */
  lenderPlaybookNameById?: Map<string, string>;
  onApplyLenderPlaybook?: (lenderId: Id<"lenders">) => void;
  /** Assign lender representative (contact) on this file. */
  onSetLenderRep?: (
    lenderId: Id<"lenders">,
    contactRepId: Id<"contacts"> | null,
  ) => void;
};

/** Lazy guideline attachment list — only queries when expanded. */
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
            Loading…
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
  lenders: lenderRows,
  selectedLenderId,
  linkByLenderId,
  readOnly = false,
  searchHits,
  lenderSearch,
  onLenderSearchChange,
  attaching,
  attachError,
  onAttachErrorClear,
  detaching,
  selecting,
  rejecting,
  restoring,
  clearing,
  confirmClear,
  onConfirmClearChange,
  onAttachLender,
  onDetachLender,
  onSelectLender,
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

  useEffect(() => {
    if (!narrow) return;
    if (lenderRows.length === 0) setMobileLenderPanel("find");
  }, [narrow, lenderRows.length]);

  const sortedLenderRows = useMemo(
    () =>
      selectedLenderId
        ? [...lenderRows].sort((a, b) => {
            const aChosen = a._id === selectedLenderId ? 0 : 1;
            const bChosen = b._id === selectedLenderId ? 0 : 1;
            return aChosen - bChosen;
          })
        : lenderRows,
    [lenderRows, selectedLenderId],
  );

  const linkedIds = useMemo(
    () => new Set(sortedLenderRows.map((l) => l._id)),
    [sortedLenderRows],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {selectedLenderId ? (
        <p className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Star className="h-3 w-3 fill-current" aria-hidden />
          Lender chosen
        </p>
      ) : null}

      {lenderRows.length > 0 && !readOnly ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5">
          {confirmClear ? (
            <>
              <span className="text-xs text-muted-foreground">
                {confirmClear === "selected"
                  ? `Remove the other ${lenderRows.length - 1}?`
                  : `Remove all ${lenderRows.length}?`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={clearing}
                onClick={() =>
                  onClearLenders(confirmClear === "selected" ? "selected" : "none")
                }
              >
                {clearing ? "Clearing…" : "Confirm"}
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
              {selectedLenderId && lenderRows.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onConfirmClearChange("selected")}
                  title="Remove every lender except the chosen one"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Clear others
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
            On file ({lenderRows.length})
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          narrow && mobileLenderPanel !== "find" && "hidden",
        )}
      >
        <p
          className={cn(
            "mb-2 text-xs text-muted-foreground",
            narrow && "max-md:line-clamp-2",
          )}
        >
          Search uses the same logic as the browse page (company, programs,
          state, contact, and more). Type at least one term to see matches.
        </p>
        <SearchField
          placeholder="Search programs (e.g. DSCR, SBA 7a), company, contact, states…"
          value={lenderSearch}
          onChange={(e) => {
            onLenderSearchChange(e.currentTarget.value);
            onAttachErrorClear();
          }}
        />
        {!lenderSearch.trim() ? null : searchHits === undefined ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            Searching…
          </p>
        ) : searchHits.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No matches.</p>
        ) : (
          <ul
            data-nested-scroll
            className="mt-2 max-h-[min(50dvh,22rem)] touch-scroll-y space-y-1.5 overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-muted/10 p-1.5 md:max-h-none"
            aria-label="Lender search results"
          >
            {searchHits.map((hit) => {
              const isLinked = linkedIds.has(hit._id);
              return (
                <li
                  key={hit._id}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-sm border border-transparent p-2 md:flex-row md:items-center md:justify-between",
                    isLinked
                      ? "bg-muted/30"
                      : "hover:border-border/80 hover:bg-background",
                  )}
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium text-foreground">
                      {hit.company || "—"}
                    </div>
                    <div className="min-w-0 break-words text-xs text-muted-foreground">
                      {[hit.primaryNiche, hit.entityType]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0 self-start sm:self-center">
                    {isLinked ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        On file
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-[44px] sm:min-h-0"
                        disabled={attaching === hit._id || readOnly}
                        onClick={() => onAttachLender(hit._id)}
                      >
                        {attaching === hit._id ? "Adding…" : "Add to file"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {attachError ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {attachError}
          </p>
        ) : null}
      </div>

      <h3
        className={cn(
          "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
          narrow && mobileLenderPanel !== "onFile" && "hidden",
        )}
      >
        On this file
      </h3>
      {lenderRows.length === 0 ? (
        <p
          className={cn(
            "rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground",
            narrow && mobileLenderPanel !== "onFile" && "hidden",
          )}
        >
          No linked lenders yet. Add one with the search above.
        </p>
      ) : (
        <ul
          className={cn(
            "space-y-2",
            narrow && mobileLenderPanel !== "onFile" && "hidden",
          )}
          aria-label="Linked lenders"
        >
          {sortedLenderRows.map((l) => {
            const isChosen = selectedLenderId === l._id;
            const isPicking = selecting === l._id;
            const lenderLink = linkByLenderId.get(String(l._id));
            const isDeclined = lenderLink?.relationshipType === "declined";
            const declineReason = lenderLink?.rejectionReason;
            return (
              <li
                key={l._id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border p-3 transition-colors duration-dlc-standard ease-dlc-standard",
                  isDeclined
                    ? "border-destructive/30 bg-destructive/5"
                    : isChosen
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/80 bg-muted/20",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {l.company || "—"}
                    </span>
                    {isDeclined ? (
                      <span
                        className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive"
                        title={
                          declineReason ? `Reason: ${declineReason}` : undefined
                        }
                      >
                        Rejected
                      </span>
                    ) : null}
                    {isChosen && !isDeclined ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Star className="h-3 w-3 fill-current" aria-hidden />
                        Chosen
                      </span>
                    ) : null}
                  </div>
                  {isDeclined && declineReason ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        Reason:
                      </span>{" "}
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
                        {onSetLenderRole && !isChosen && !readOnly ? (
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
                                  e.currentTarget
                                    .value as FileLenderAssignableRole,
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
                          (prog) =>
                            prog.name === lenderLink?.selectedProgramName,
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
                              <span> · Min FICO {chosenProgram.minFico}</span>
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
                          Apply “{lenderPlaybookNameById.get(String(l._id))}”
                          task playbook
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {isDeclined && !readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[40px] shrink-0 sm:min-h-0"
                      disabled={restoring === l._id}
                      onClick={() => void onRestoreLender(l._id)}
                      aria-label={`Bring back ${l.company || "lender"} on this file`}
                    >
                      {restoring === l._id ? "Restoring…" : "Bring Back"}
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
                      aria-label={`Reject ${l.company || "lender"} for this file`}
                    >
                      Rejected
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant={isChosen ? "outline" : "ghost"}
                    className={cn(
                      "min-h-[40px] shrink-0 sm:min-h-0",
                      isChosen
                        ? "text-primary hover:text-primary"
                        : "text-muted-foreground hover:text-primary",
                    )}
                    disabled={isPicking || isDeclined || readOnly}
                    onClick={() => onSelectLender(isChosen ? null : l._id)}
                    aria-label={
                      isDeclined
                        ? `${l.company || "Lender"} is rejected and cannot be selected`
                        : isChosen
                          ? `Unselect ${l.company || "lender"}`
                          : `Select ${l.company || "lender"} as the chosen lender`
                    }
                    title={
                      isDeclined
                        ? "Rejected lenders cannot be selected"
                        : isChosen
                          ? "Click to clear selection"
                          : "Mark as the chosen lender for this file"
                    }
                  >
                    <Star
                      className={cn("h-4 w-4", isChosen && "fill-current")}
                    />
                    <span className="hidden sm:inline">
                      {isChosen ? "Chosen" : "Select"}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDetachLender(l._id)}
                    disabled={detaching === l._id || readOnly}
                    aria-label={`Remove ${l.company || "lender"} from file`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
