"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ChevronRight, Search, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";

const SEARCH_DEBOUNCE_MS = 280;
const STEPS = ["Select duplicate", "Compare", "Confirm"] as const;

export type MergeRecordKind = "contact" | "entity";

export type MergeRecordModalProps = {
  open: boolean;
  onClose: () => void;
  recordKind: MergeRecordKind;
  survivingRecordId: Id<"contacts"> | Id<"clients">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  recordLabel?: string;
  onMerged?: () => void;
};

type FieldWinner = "surviving" | "merged";

export function MergeRecordModal({
  open,
  onClose,
  recordKind,
  survivingRecordId,
  organizationId,
  memberUserKey,
  recordLabel,
  onMerged,
}: MergeRecordModalProps) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mergedRecordId, setMergedRecordId] = useState<string>("");
  const [fieldWinners, setFieldWinners] = useState<Record<string, FieldWinner>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergeContacts = useMutation(api.crmConsolidation.mergeContacts);
  const mergeEntities = useMutation(api.crmConsolidation.mergeEntities);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setQuery("");
    setDebouncedQuery("");
    setMergedRecordId("");
    setFieldWinners({});
    setError(null);
  }, [open, survivingRecordId]);

  const searchResults = useQuery(
    api.crmIngestionSearch.searchIngestionByName,
    open && debouncedQuery.trim().length > 0
      ? {
          organizationId,
          memberUserKey,
          query: debouncedQuery,
          kind: recordKind === "contact" ? "individual" : "entity",
          limit: 12,
        }
      : "skip",
  );

  const preview = useQuery(
    api.crmConsolidation.previewMerge,
    open && mergedRecordId
      ? {
          organizationId,
          memberUserKey,
          recordKind,
          survivingRecordId: String(survivingRecordId),
          mergedRecordId,
        }
      : "skip",
  );

  useEffect(() => {
    if (!preview?.conflicts) return;
    setFieldWinners((prev) => {
      const next = { ...prev };
      for (const conflict of preview.conflicts) {
        if (!next[conflict.field]) {
          next[conflict.field] = "surviving";
        }
      }
      return next;
    });
  }, [preview?.conflicts]);

  const duplicateOptions = useMemo(() => {
    if (recordKind === "contact") {
      return (searchResults?.individuals ?? []).filter(
        (row) => String(row.contactId) !== String(survivingRecordId),
      );
    }
    return (searchResults?.entities ?? []).filter(
      (row) => String(row.entityId) !== String(survivingRecordId),
    );
  }, [recordKind, searchResults, survivingRecordId]);

  const selectedDuplicateLabel = useMemo(() => {
    if (!mergedRecordId || !preview) return "";
    return preview.merged.label;
  }, [mergedRecordId, preview]);

  const reparentSummary = useMemo(() => {
    if (!preview?.reparentCounts) return [];
    const c = preview.reparentCounts;
    const lines: string[] = [];
    if (recordKind === "contact") {
      if (c.contactFileLinks > 0) {
        lines.push(`${c.contactFileLinks} pipeline file link(s)`);
      }
      if (c.entityContactLinks > 0) {
        lines.push(`${c.entityContactLinks} entity portfolio link(s)`);
      }
      if (c.individualContactLinks > 0) {
        lines.push(`${c.individualContactLinks} person-to-person link(s)`);
      }
      if (c.contactLenderLinks > 0) {
        lines.push(`${c.contactLenderLinks} lender link(s)`);
      }
      if (c.clientsAsPrimaryContact > 0) {
        lines.push(
          `${c.clientsAsPrimaryContact} client workspace(s) as primary contact`,
        );
      }
    } else {
      if (c.projects > 0) lines.push(`${c.projects} project(s)`);
      if (c.pipelineFiles > 0) lines.push(`${c.pipelineFiles} loan file(s)`);
      if (c.fileClients > 0) {
        lines.push(`${c.fileClients} indexed file–entity edge(s)`);
      }
      if (c.loanClients > 0) {
        lines.push(`${c.loanClients} loan client junction(s)`);
      }
      if (c.entityContactLinks > 0) {
        lines.push(`${c.entityContactLinks} cap table / principal link(s)`);
      }
    }
    return lines;
  }, [preview?.reparentCounts, recordKind]);

  function goNext() {
    setError(null);
    if (step === 0) {
      if (!mergedRecordId) {
        setError("Select the duplicate record to merge away.");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleMerge() {
    if (!mergedRecordId || !preview) return;
    setError(null);
    setSubmitting(true);
    try {
      const fieldResolutions = preview.conflicts.map((conflict) => ({
        field: conflict.field,
        winner: fieldWinners[conflict.field] ?? ("surviving" as const),
      }));
      if (recordKind === "contact") {
        await mergeContacts({
          organizationId,
          memberUserKey,
          survivingRecordId: survivingRecordId as Id<"contacts">,
          mergedRecordId: mergedRecordId as Id<"contacts">,
          fieldResolutions,
        });
      } else {
        await mergeEntities({
          organizationId,
          memberUserKey,
          survivingRecordId: survivingRecordId as Id<"clients">,
          mergedRecordId: mergedRecordId as Id<"clients">,
          fieldResolutions,
        });
      }
      onMerged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const subject = recordLabel?.trim() || preview?.surviving.label || "this record";

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      align="bottom-sheet"
      wrapPanel={false}
      data-testid="merge-record-modal"
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-dlc-surface-high p-5 shadow-dlc-3">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-dlc-label-md font-medium uppercase tracking-wide text-muted-foreground">
              Consolidate duplicates
            </p>
            <h2 className="text-lg font-semibold">Merge record</h2>
            <p className="mt-1 text-dlc-body-sm text-muted-foreground">
              Keep <span className="font-medium text-foreground">{subject}</span>{" "}
              and merge the duplicate into it.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol
          className="mb-5 flex flex-wrap items-center gap-1 text-dlc-label-md"
          aria-label="Merge progress"
        >
          {STEPS.map((label, index) => (
            <li key={label} className="flex min-w-0 items-center gap-1">
              <span
                className={cn(
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium",
                  index === step
                    ? "bg-primary text-primary-foreground"
                    : index < step
                      ? "bg-muted text-foreground"
                      : "bg-muted/60 text-muted-foreground",
                )}
                aria-current={index === step ? "step" : undefined}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate sm:inline",
                  index === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 ? (
                <ChevronRight
                  className="mx-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="space-y-3">
            <Label htmlFor="merge-duplicate-search">
              Find duplicate {recordKind === "contact" ? "contact" : "entity"}
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="merge-duplicate-search"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                autoFocus
              />
            </div>
            <ul
              className="max-h-56 space-y-1 overflow-y-auto rounded-dlc-md border border-border/80"
              role="listbox"
              aria-label="Duplicate search results"
            >
              {debouncedQuery.trim().length === 0 ? (
                <li className="px-3 py-4 text-dlc-body-sm text-muted-foreground">
                  Type to search for the duplicate record.
                </li>
              ) : searchResults === undefined ? (
                <li className="px-3 py-4 text-dlc-body-sm text-muted-foreground">
                  Searching…
                </li>
              ) : duplicateOptions.length === 0 ? (
                <li className="px-3 py-4 text-dlc-body-sm text-muted-foreground">
                  No matching duplicates found.
                </li>
              ) : (
                duplicateOptions.map((row) => {
                  const id =
                    recordKind === "contact"
                      ? (row as { contactId: Id<"contacts"> }).contactId
                      : (row as { entityId: Id<"clients"> }).entityId;
                  const label =
                    recordKind === "contact"
                      ? (row as { name: string }).name
                      : (row as { displayName: string }).displayName;
                  const selected = String(id) === mergedRecordId;
                  return (
                    <li key={String(id)}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                          selected && "bg-primary/10 font-medium text-primary",
                        )}
                        onClick={() => setMergedRecordId(String(id))}
                      >
                        <span className="truncate">{label}</span>
                        {selected ? (
                          <span className="shrink-0 text-dlc-label-md">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {preview === undefined ? (
              <p className="text-dlc-body-sm text-muted-foreground">
                Loading comparison…
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-dlc-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-dlc-label-md font-medium text-muted-foreground">
                      Keeping
                    </p>
                    <p className="font-semibold">{preview.surviving.label}</p>
                  </div>
                  <div className="rounded-dlc-lg border border-border/80 bg-muted/20 p-3">
                    <p className="text-dlc-label-md font-medium text-muted-foreground">
                      Merging away
                    </p>
                    <p className="font-semibold">{preview.merged.label}</p>
                  </div>
                </div>

                {preview.conflicts.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-dlc-body-sm font-medium text-foreground">
                      Resolve conflicting fields
                    </p>
                    {preview.conflicts.map((conflict) => (
                      <fieldset
                        key={conflict.field}
                        className="rounded-dlc-lg border border-border/80 p-3"
                      >
                        <legend className="px-1 text-dlc-label-md font-medium">
                          {conflict.label}
                        </legend>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="flex cursor-pointer gap-2 rounded-dlc-md border border-border px-3 py-2 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                            <input
                              type="radio"
                              name={`merge-field-${conflict.field}`}
                              checked={
                                (fieldWinners[conflict.field] ?? "surviving") ===
                                "surviving"
                              }
                              onChange={() =>
                                setFieldWinners((prev) => ({
                                  ...prev,
                                  [conflict.field]: "surviving",
                                }))
                              }
                            />
                            <span className="min-w-0 text-sm">
                              <span className="block text-dlc-label-md text-muted-foreground">
                                Keep
                              </span>
                              <span className="font-medium">
                                {conflict.survivingValue}
                              </span>
                            </span>
                          </label>
                          <label className="flex cursor-pointer gap-2 rounded-dlc-md border border-border px-3 py-2 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                            <input
                              type="radio"
                              name={`merge-field-${conflict.field}`}
                              checked={fieldWinners[conflict.field] === "merged"}
                              onChange={() =>
                                setFieldWinners((prev) => ({
                                  ...prev,
                                  [conflict.field]: "merged",
                                }))
                              }
                            />
                            <span className="min-w-0 text-sm">
                              <span className="block text-dlc-label-md text-muted-foreground">
                                Use duplicate
                              </span>
                              <span className="font-medium">
                                {conflict.mergedValue}
                              </span>
                            </span>
                          </label>
                        </div>
                      </fieldset>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-dlc-lg border border-border/80 bg-muted/20 px-3 py-3 text-dlc-body-sm text-muted-foreground">
                    No field conflicts detected — linked data will still be
                    consolidated.
                  </p>
                )}

                {reparentSummary.length > 0 ? (
                  <div className="rounded-dlc-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
                    <p className="flex items-center gap-2 text-dlc-body-sm font-medium text-foreground">
                      <AlertTriangle
                        className="h-4 w-4 shrink-0 text-amber-600"
                        aria-hidden
                      />
                      Data to re-parent
                    </p>
                    <ul className="mt-2 list-inside list-disc text-dlc-body-sm text-muted-foreground">
                      {reparentSummary.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-dlc-lg border border-destructive/40 bg-destructive/5 px-4 py-4">
              <p className="flex items-start gap-2 text-dlc-body-sm text-foreground">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                  aria-hidden
                />
                <span>
                  <strong>{selectedDuplicateLabel || "The duplicate record"}</strong>{" "}
                  will be permanently deleted after its links and history are moved
                  to <strong>{subject}</strong>. This cannot be undone.
                </span>
              </p>
            </div>
            {reparentSummary.length > 0 ? (
              <ul className="list-inside list-disc text-dlc-body-sm text-muted-foreground">
                {reparentSummary.map((line) => (
                  <li key={line}>{line} will move to the surviving record</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div>
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext} disabled={!mergedRecordId}>
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                disabled={submitting || !preview}
                onClick={() => void handleMerge()}
              >
                {submitting ? "Merging…" : "Merge records — cannot be undone"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </OverlayShell>
  );
}
