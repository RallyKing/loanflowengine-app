"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  X,
  Save,
  Trash2,
  Edit3,
  ExternalLink,
  Mail,
  Phone,
  Plus,
  Sparkles,
  GitMerge,
  Paperclip,
  FileText,
  StickyNote,
  Eye,
  Maximize2,
  Minimize2,
  Upload,
  UserCircle2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { Input, Label, Select, Textarea } from "./ui/Input";
import { SearchField } from "./ui/SearchField";
import { Badge } from "./ui/Badge";
import { Stars } from "./ui/Stars";
import {
  FIELD_META,
  LENDER_FIELDS,
  ENTITY_TYPES,
  type Lender,
  type LenderField,
  type Program,
} from "@/lib/schema";
import {
  contactMethodsCreateArgs,
  resolvePreferredEmail,
  resolvePreferredPhone,
} from "@/lib/contact/contactMethods";

/** Primary CSV columns still stored on the lender row; hidden here so editing flows through Contacts. */
const LENDER_FIELDS_HIDDEN_LEGACY_CONTACT: ReadonlySet<LenderField> = new Set([
  "contactName",
  "titleRole",
  "phone",
  "email",
]);
import { cn } from "@/lib/cn";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOrgConvexQueryArgs, type OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import {
  MAX_LENDER_ATTACHMENT_BYTES,
  uploadLocalFilesViaConvexUrl,
  validateLenderAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AttachmentPreviewDialog } from "@/components/AttachmentPreviewDialog";
import { InlineText, InlineTextarea } from "@/components/inline";
import {
  RecordInspectorBody,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSkeleton,
} from "@/components/RecordInspectorShell";
import { useWorkspaceSheetDragLock } from "@/components/PipelineWorkspaceMobileVaulFrame";
import { CommunicationHistoryPanel } from "@/components/communications/CommunicationHistoryPanel";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm, unlinkConfirm } from "@/lib/ui/confirmDestructive";

export function LenderDrawer({
  id,
  onClose,
  onLenderReplaced,
}: {
  id: Id<"lenders"> | null;
  onClose: () => void;
  /** When the open lender was the duplicate removed, parent should select the kept id. */
  onLenderReplaced?: (keepId: Id<"lenders">) => void;
}) {
  const { confirm } = useOperationalConfirm();
  useWorkspaceSheetDragLock(id !== null);
  const { accountId } = useUserPreferences();
  const orgScope = useOrgConvexQueryArgs();
  const getLenderQueryArgs = useMemo(():
    | ({ id: Id<"lenders"> } & OrgScopedConvexArgs)
    | "skip" => {
    if (id === null || !orgScope) return "skip";
    return { id, ...orgScope };
  }, [id, orgScope]);
  const lender = useQuery(api.lenders.get, getLenderQueryArgs);
  const update = useMutation(api.lenders.update);
  const remove = useMutation(api.lenders.remove);
  const mergeLendersM = useMutation(api.lenders.mergeLenders);
  const rate = useMutation(api.lenders.rate);
  const setNotesM = useMutation(api.lenders.setNotes);
  const enrich = useAction(api.enrich.enrichLender);
  const { canUseHub, actionTitle } = useLiveConnection();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Lender | null>(null);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Id<"lenders"> | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);
  /** Read-mode profile notes: synced from server unless the user is editing. */
  const [profileNotes, setProfileNotes] = useState("");
  const [profileNotesDirty, setProfileNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const mergeListQuery = useMemo(():
    | ({ search: string; limit: number } & OrgScopedConvexArgs)
    | "skip" => {
    if (editing || !orgScope) return "skip";
    const s = mergeQuery.trim();
    if (s.length < 2) return "skip";
    return { search: s, limit: 20, ...orgScope };
  }, [mergeQuery, editing, orgScope]);
  const mergeHits = useQuery(
    api.lenders.list,
    id && lender && !editing ? mergeListQuery : "skip"
  ) as Doc<"lenders">[] | undefined;
  const mergeHitRows = useMemo(
    () => (mergeHits ?? []).filter((r) => r._id !== id),
    [mergeHits, id]
  );

  /** When the Convex record updates (e.g. after Enrich), refresh the view unless the user is mid-edit. */
  useEffect(() => {
    if (!lender) return;
    setDraft((d) => {
      if (editing && d && d._id === lender._id) return d;
      return lender as unknown as Lender;
    });
  }, [lender, editing]);

  useEffect(() => {
    setEditing(false);
    setEnrichMsg(null);
    setMergeQuery("");
    setMergeTarget(null);
    setMergeMsg(null);
    setProfileNotesDirty(false);
    setFullScreen(false);
  }, [id]);

  useEffect(() => {
    if (editing) return;
    if (!lender) return;
    if (profileNotesDirty) return;
    setProfileNotes(lender.notes ?? "");
  }, [lender, editing, profileNotesDirty, lender?._id, lender?.updatedAt, lender?.notes]);

  const consumeEscape = useCallback(() => {
    if (fullScreen) {
      setFullScreen(false);
      return true;
    }
    return false;
  }, [fullScreen]);

  if (!id) return null;
  if (!lender || !draft) {
    return (
      <RecordInspectorShell
        resizable={!fullScreen}
        onClose={onClose}
        ariaLabel="Lender profile"
        recordKind="lender"
      >
        <RecordInspectorHeader>
          <div
            className="h-7 w-56 max-w-[70%] animate-pulse rounded-md bg-muted/50"
            aria-hidden
          />
        </RecordInspectorHeader>
        <RecordInspectorBody>
          <RecordInspectorSkeleton rows={6} />
          <p className="sr-only" role="status">
            Loading…
          </p>
        </RecordInspectorBody>
      </RecordInspectorShell>
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const d = draft as unknown as Record<string, unknown>;
      // Strip all server-managed fields before sending to `update`. The
      // update mutation's validator rejects anything outside lenderInput.
      const SERVER_ONLY = new Set([
        "_id",
        "_creationTime",
        "createdAt",
        "updatedAt",
        "companyKey",
        "emailKey",
        "contactKey",
        "enrichedAt",
        "enrichmentStatus",
        "enrichmentSources",
        "incompleteData",
        "searchText",
      ]);
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d)) {
        if (SERVER_ONLY.has(k)) continue;
        clean[k] = v;
      }
      const {
        programList,
        contacts,
        phoneNumbers,
        rating,
        ratingNotes,
        ...rest
      } = clean as unknown as Lender;

      const cleanedPrograms = (programList ?? [])
        .map((p) => ({
          name: (p.name ?? "").trim(),
          minFico: (p.minFico ?? "").trim(),
          requirements: (p.requirements ?? "").trim(),
        }))
        .filter((p) => p.name || p.minFico || p.requirements);

      const cleanedContacts = (contacts ?? [])
        .map((c) => ({
          name: (c.name ?? "").trim(),
          titleRole: (c.titleRole ?? "").trim(),
          phone: (c.phone ?? "").trim(),
          email: (c.email ?? "").trim(),
          notes: (c.notes ?? "").trim(),
        }))
        .filter((c) => c.name || c.phone || c.email);

      const cleanedPhones = (phoneNumbers ?? [])
        .map((p) => ({
          label: (p.label ?? "").trim(),
          phone: (p.phone ?? "").trim(),
        }))
        .filter((p) => p.phone);

      await update({
        id: id as Id<"lenders">,
        ...(rest as unknown as Record<string, string>),
        programList: cleanedPrograms,
        contacts: cleanedContacts,
        phoneNumbers: cleanedPhones,
        rating: rating ?? 0,
        ratingNotes: ratingNotes ?? "",
      } as never);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function setRating(stars: number) {
    if (!draft || !id) return;
    setDraft({ ...draft, rating: stars } as Lender);
    try {
      await rate({ id: id as Id<"lenders">, rating: stars });
    } catch {
      // revert on failure
    }
  }

  async function runEnrich() {
    if (!id || enriching) return;
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const res = await enrich({ id: id as Id<"lenders"> });
      if (res.status === "ok") {
        const src =
          res.sources?.length > 0
            ? ` · ${res.sources.length} source URL${res.sources.length === 1 ? "" : "s"} in record`
            : "";
        setEnrichMsg(
          res.filled.length > 0
            ? `Filled ${res.filled.length} field${res.filled.length === 1 ? "" : "s"}: ${res.filled.join(", ")}${src}`
            : `No new public data found.${src}`
        );
      } else {
        setEnrichMsg(res.error ?? "Enrichment failed");
      }
    } catch (err) {
      setEnrichMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setEnriching(false);
    }
  }

  function updatePrograms(next: Program[]) {
    if (!draft) return;
    setDraft({ ...draft, programList: next } as Lender);
  }
  function addProgram() {
    updatePrograms([
      ...(draft?.programList ?? []),
      { name: "", minFico: "", requirements: "" },
    ]);
  }
  function removeProgram(i: number) {
    const curr = draft?.programList ?? [];
    updatePrograms(curr.filter((_, idx) => idx !== i));
  }
  function patchProgram(i: number, patch: Partial<Program>) {
    const curr = draft?.programList ?? [];
    updatePrograms(curr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function runMerge(keepId: Id<"lenders">, removeId: Id<"lenders">) {
    if (merging) return;
    if (keepId === removeId) return;
    const ok = await confirm({
      ...simpleDeleteConfirm("duplicate lender", {
        title: "Merge lenders",
        impact:
          "The duplicate row is removed and its non-empty fields fold into the lender you keep. This cannot be undone.",
        confirmLabel: "Merge",
      }),
    });
    if (!ok) return;
    setMerging(true);
    setMergeMsg(null);
    try {
      const res = await mergeLendersM({ keepId, removeId });
      if (removeId === id) onLenderReplaced?.(res.keepId);
      setMergeQuery("");
      setMergeTarget(null);
    } catch (e) {
      setMergeMsg(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  async function destroy() {
    const entityName = draft?.company?.trim() || "this lender";
    const ok = await confirm({
      ...simpleDeleteConfirm(entityName, {
        title: "Delete lender",
        impact: "This cannot be undone.",
      }),
    });
    if (!ok) return;
    await remove({ id: id as Id<"lenders"> });
    onClose();
  }

  const noteDelta =
    (profileNotes || "").trim() !== (lender?.notes ?? "").trim();
  async function saveProfileNotes() {
    if (!id) return;
    if (!canUseHub || !noteDelta) return;
    setSavingNotes(true);
    try {
      await setNotesM({ id, notes: profileNotes });
      setProfileNotesDirty(false);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <RecordInspectorShell
      resizable={!fullScreen}
      onClose={onClose}
      scrimCloseEnabled={!saving}
      escapeCloseEnabled={!saving}
      fullScreen={fullScreen}
      ariaLabel="Lender profile"
      recordKind="lender"
      consumeEscape={consumeEscape}
    >
      <RecordInspectorHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{draft.company}</h2>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className="inline-block"
                title={!editing ? actionTitle("Set rating") : undefined}
              >
                <Stars
                  value={draft.rating ?? 0}
                  onChange={editing || !canUseHub ? undefined : setRating}
                  size="sm"
                  readOnly={editing || !canUseHub}
                />
              </span>
              {draft.entityType.split(";").map((e) => (
                <Badge key={e} variant="accent">
                  {e.trim()}
                </Badge>
              ))}
              {draft.status && (
                <Badge variant="warning">{draft.status}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={runEnrich}
                disabled={enriching || !canUseHub}
                title={actionTitle(
                  "Use AI web search to fill in missing public info"
                )}
              >
                <Sparkles className="h-4 w-4" />
                {enriching ? "Enriching…" : "Enrich"}
              </Button>
            )}
            {!editing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft((d) => (d ? { ...d, notes: profileNotes } : d));
                  setProfileNotesDirty(false);
                  setEditing(true);
                }}
              >
                <Edit3 className="h-4 w-4" /> Edit
              </Button>
            )}
            {editing && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={save}
                  disabled={saving || !canUseHub}
                  title={actionTitle("Save changes to this lender")}
                >
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(lender as unknown as Lender);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={destroy}
              title={actionTitle("Delete this lender from the database")}
              disabled={!canUseHub}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFullScreen((v) => !v)}
              aria-label={fullScreen ? "Exit full screen" : "Expand to full screen"}
              aria-pressed={fullScreen}
              title={fullScreen ? "Exit full screen" : "Expand to full screen"}
            >
              {fullScreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </RecordInspectorHeader>

      <RecordInspectorBody>
          {enrichMsg && (
            <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {enrichMsg}
            </div>
          )}
          {!editing ? (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3 text-sm">
                  {draft.website && (
                    <a
                      href={
                        draft.website.startsWith("http")
                          ? draft.website
                          : `https://${draft.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {draft.website}
                    </a>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Rep name, title, phone, and email are edited through{" "}
                  <span className="font-medium text-foreground">Lender contacts</span>{" "}
                  below (global Contacts + roles). Legacy CSV columns and embedded contact rows
                  stay on the lender record for search and imports until a future database
                  cleanup — saving this profile elsewhere does not erase them.
                </p>
              </div>

              <LenderContactsPanel
                lenderId={id}
                lenderOrganizationId={draft.organizationId}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />

              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="flex items-center gap-2 normal-case text-foreground">
                    <StickyNote className="h-3.5 w-3.5" aria-hidden />
                    Profile notes
                  </span>
                }
                description="Your notes for this lender (reminders, terms discussed, or anything the CSV or enrichment didn’t capture). Searchable with the rest of the profile."
              >
                <Textarea
                  className="min-h-[5.5rem] text-sm"
                  value={profileNotes}
                  onChange={(e) => {
                    setProfileNotes(e.target.value);
                    setProfileNotesDirty(true);
                  }}
                  readOnly={!canUseHub}
                  title={!canUseHub ? actionTitle("Add notes to this profile") : undefined}
                  rows={4}
                />
                {canUseHub && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => void saveProfileNotes()}
                      disabled={!noteDelta || savingNotes}
                      title={actionTitle("Save profile notes only")}
                    >
                      {savingNotes ? "Saving…" : "Save notes"}
                    </Button>
                  </div>
                )}
              </CollapsibleSection>

              {draft.organizationId ? (
                <CollapsibleSection
                  variant="card"
                  defaultOpen
                  title={
                    <span className="flex items-center gap-2 normal-case text-foreground">
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Communication hub
                    </span>
                  }
                  description="Unified outbound history for this lender across email and portal-linked conversations."
                >
                  <CommunicationHistoryPanel
                    organizationId={draft.organizationId}
                    memberUserKey={accountId.trim() || undefined}
                    relatedLenderId={id ?? undefined}
                    emptyLabel="No outbound communication logged for this lender yet."
                    maxHeightClassName="max-h-56"
                  />
                </CollapsibleSection>
              ) : null}

              <Section title="Programs & Specialty">
                <Field k="Primary Niche" v={draft.primaryNiche} />
                <Field k="Programs / Funding Types" v={draft.programs} />
                <Field k="Property Types" v={draft.propertyTypes} />
                <Field k="Exclusions" v={draft.exclusions} />
              </Section>

              {draft.programList && draft.programList.length > 0 && (
                <CollapsibleSection
                  variant="card"
                  defaultOpen
                  title={
                    <span className="text-sm font-semibold normal-case">
                      Programs (structured)
                    </span>
                  }
                >
                  <div className="space-y-3">
                    {draft.programList.map((p, i) => (
                      <div
                        key={i}
                        className="rounded-md border bg-muted/30 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold">
                            {p.name || <span className="text-muted-foreground italic">(unnamed program)</span>}
                          </div>
                          {p.minFico && (
                            <Badge variant="warning">
                              Min FICO: {p.minFico}
                            </Badge>
                          )}
                        </div>
                        {p.requirements && (
                          <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                            {p.requirements}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              <Section title="Deal Parameters">
                <Field k="States Served" v={draft.statesServed} />
                <Field k="Owner / Investor" v={draft.ownerOrInvestor} />
                <Field
                  k="Funding Amount"
                  v={
                    draft.fundingAmountMin || draft.fundingAmountMax
                      ? `${draft.fundingAmountMin || "—"} to ${draft.fundingAmountMax || "—"}`
                      : ""
                  }
                />
                <Field
                  k="Min FICO (confirmed)"
                  v={draft.minFico ? `${draft.minFico}` : ""}
                />
                <Field k="LTV / Leverage" v={draft.ltv} />
                <Field k="Interest Rates" v={draft.interestRates} />
                <Field k="Amortization / Term" v={draft.amortTerm} />
                <Field k="Referral / YSP Fees" v={draft.referralFees} />
              </Section>

              {(draft.ratingNotes ||
                (draft.enrichmentSources && draft.enrichmentSources.length > 0) ||
                draft.enrichedAt) && (
                <Section title="Rating & Enrichment">
                  {draft.ratingNotes && (
                    <div className="col-span-full">
                      <div className="text-xs text-muted-foreground">
                        Why you like them
                      </div>
                      <div className="text-sm leading-5">
                        {draft.ratingNotes}
                      </div>
                    </div>
                  )}
                  {draft.enrichedAt && (
                    <Field
                      k="Last AI enrichment"
                      v={`${new Date(draft.enrichedAt).toLocaleString()}${
                        draft.enrichmentStatus
                          ? ` · ${draft.enrichmentStatus}`
                          : ""
                      }`}
                    />
                  )}
                  {draft.enrichmentSources &&
                    draft.enrichmentSources.length > 0 && (
                      <div className="col-span-full">
                        <div className="text-xs text-muted-foreground">
                          Sources
                        </div>
                        <ul className="mt-1 space-y-1 text-sm">
                          {draft.enrichmentSources.map((u, i) => (
                            <li key={i} className="truncate">
                              <a
                                href={u}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {u}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </Section>
              )}

              {!editing && (
                <CollapsibleSection
                  defaultOpen={false}
                  className="border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/30"
                  title={
                    <span className="flex items-center gap-2 text-amber-950 normal-case dark:text-amber-100">
                      <GitMerge className="h-4 w-4" aria-hidden />
                      Merge duplicate
                    </span>
                  }
                  description="Search for a second lender, tap to select, then pick which company row to keep. The other is deleted; empty fields are filled, notes and lists are combined."
                >
                  {mergeMsg && (
                    <p className="mb-2 text-xs text-destructive" role="alert">
                      {mergeMsg}
                    </p>
                  )}
                  <SearchField
                    placeholder="Type 2+ characters to search (company, contact, programs…)"
                    value={mergeQuery}
                    onChange={(e) => {
                      setMergeQuery(e.target.value);
                      setMergeTarget(null);
                    }}
                    disabled={!canUseHub || merging}
                    title={actionTitle("Search lenders to merge")}
                  />
                  {mergeQuery.trim().length >= 2 && mergeHitRows.length > 0 && (
                    <ul className="mt-2 max-h-40 touch-scroll-y space-y-0.5 overflow-y-auto rounded border bg-background p-1 text-sm">
                      {mergeHitRows.map((r) => (
                        <li key={r._id}>
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded px-2 py-1.5 text-left text-foreground hover:bg-muted",
                              mergeTarget === r._id && "bg-muted font-medium"
                            )}
                            onClick={() => setMergeTarget(r._id)}
                          >
                            {r.company}
                            {r.contactName ? ` — ${r.contactName}` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {mergeQuery.trim().length >= 2 && mergeHitRows.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No other lenders match this search.
                    </p>
                  )}
                  {mergeTarget && (
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={!canUseHub || merging}
                        onClick={() =>
                          void runMerge(
                            id as Id<"lenders">,
                            mergeTarget
                          )
                        }
                        title={actionTitle("Keep the open company as primary")}
                      >
                        {merging
                          ? "Merging…"
                          : `Keep “${draft.company}” and merge the other in`}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={!canUseHub || merging}
                        onClick={() =>
                          void runMerge(mergeTarget, id as Id<"lenders">)
                        }
                        title={actionTitle("Keep the search result as primary")}
                      >
                        {merging
                          ? "Merging…"
                          : "Use the selected result as the main record (this one is removed)"}
                      </Button>
                    </div>
                  )}
                </CollapsibleSection>
              )}

              {id && (
                <LenderAttachmentsPanel
                  lenderId={id as Id<"lenders">}
                  canUseHub={canUseHub}
                  actionTitle={actionTitle}
                />
              )}

              <Section title="Metadata">
                <Field k="Source" v={draft.source} />
                <Field k="Section" v={draft.section} />
                <Field k="Last Updated" v={draft.lastUpdated} />
              </Section>
            </div>
          ) : (
            <div className="space-y-5">
              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="flex items-center gap-2 normal-case text-foreground">
                    <StickyNote className="h-3.5 w-3.5" aria-hidden />
                    Profile notes
                  </span>
                }
                description="Free-form notes for this profile. Shown in this drawer and included in search."
              >
                <Textarea
                  className="min-h-[5.5rem] text-sm"
                  value={draft.notes ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value } as Lender)
                  }
                  rows={4}
                />
              </CollapsibleSection>

              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="text-sm font-semibold normal-case text-foreground">
                    Programs (structured editor)
                  </span>
                }
                description="Add each program this lender offers, its minimum FICO, and any specific requirements (DSCR floor, seasoning, reserves, experience, etc.)."
                headerRight={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addProgram}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add program
                  </Button>
                }
              >
                {(draft.programList ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                    No structured programs yet. Click &quot;Add program&quot; to start.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(draft.programList ?? []).map((p, i) => (
                      <div
                        key={i}
                        className="rounded-md border bg-muted/20 p-3"
                      >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="md:col-span-2">
                            <Label>Program name</Label>
                            <Input
                              className="mt-1"
                              placeholder="e.g. DSCR Investor / SBA 7(a) / Bridge"
                              value={p.name ?? ""}
                              onChange={(e) =>
                                patchProgram(i, { name: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label hint="Leave blank to use the lender-wide min">
                              Min FICO
                            </Label>
                            <Input
                              className="mt-1"
                              placeholder="680"
                              inputMode="numeric"
                              value={p.minFico ?? ""}
                              onChange={(e) =>
                                patchProgram(i, { minFico: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-3">
                          <Label hint="Anything other than FICO — DSCR, LTV, seasoning, experience, reserves, doc type, etc.">
                            Requirements / notes
                          </Label>
                          <Textarea
                            className="mt-1"
                            rows={3}
                            placeholder={"e.g. DSCR >= 1.1\n12mo reserves\nMin 2 prior flips"}
                            value={p.requirements ?? ""}
                            onChange={(e) =>
                              patchProgram(i, {
                                requirements: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProgram(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />{" "}
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="text-sm font-semibold normal-case text-foreground">
                    Rating &amp; stars
                  </span>
                }
                description="Rate 1-5 to boost this lender in scenario search. Click the same star again to clear."
              >
                <div className="flex items-center gap-3">
                  <Stars
                    value={draft.rating ?? 0}
                    onChange={(n) => setDraft({ ...draft, rating: n } as Lender)}
                    size="lg"
                  />
                  <span className="text-xs text-muted-foreground">
                    {draft.rating ? `${draft.rating}/5` : "Not rated"}
                  </span>
                </div>
                <div className="mt-3">
                  <Label>Rating notes (optional)</Label>
                  <Textarea
                    rows={2}
                    placeholder="What do you like about this lender? (e.g. fast close, flexible on FICO, great service)"
                    value={draft.ratingNotes ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, ratingNotes: e.target.value } as Lender)
                    }
                  />
                </div>
              </CollapsibleSection>

              <LenderContactsPanel
                lenderId={id}
                lenderOrganizationId={draft.organizationId}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />

              {id && (
                <LenderAttachmentsPanel
                  lenderId={id as Id<"lenders">}
                  canUseHub={canUseHub}
                  actionTitle={actionTitle}
                />
              )}

              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="text-sm font-semibold normal-case text-foreground">
                    All fields (raw editor)
                  </span>
                }
                description="CSV-aligned columns except primary contact name / title / phone / email (use Lender contacts above). Notes are edited in the profile block while this profile is open in edit mode. Saving still preserves legacy columns on the server."
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {LENDER_FIELDS.filter(
                    (f) =>
                      f !== "notes" && !LENDER_FIELDS_HIDDEN_LEGACY_CONTACT.has(f)
                  ).map((f) => {
                    const meta = FIELD_META[f];
                    const value =
                      (draft as unknown as Record<string, string>)[f] ?? "";
                    const common = {
                      value,
                      onChange: (
                        e: React.ChangeEvent<
                          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                        >
                      ) =>
                        setDraft({
                          ...draft,
                          [f]: e.target.value,
                        } as Lender),
                    };
                    const fullWidth =
                      meta.multiline || f === "programs" || f === "propertyTypes";
                    return (
                      <div key={f} className={cn(fullWidth && "md:col-span-2")}>
                        <Label hint={meta.hint}>{meta.label}</Label>
                        {f === "entityType" ? (
                          <>
                            <Select
                              className="mt-1"
                              value={value}
                              onChange={common.onChange}
                            >
                              <option value="">(auto-classify)</option>
                              {ENTITY_TYPES.map((e) => (
                                <option key={e} value={e}>
                                  {e}
                                </option>
                              ))}
                              {value &&
                                !ENTITY_TYPES.includes(
                                  value as (typeof ENTITY_TYPES)[number]
                                ) && (
                                  <option value={value}>{value}</option>
                                )}
                            </Select>
                          </>
                        ) : meta.multiline ? (
                          <Textarea className="mt-1" rows={5} {...common} />
                        ) : (
                          <Input className="mt-1" {...common} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            </div>
          )}
      </RecordInspectorBody>
    </RecordInspectorShell>
  );
}

function LenderContactsPanel({
  lenderId,
  lenderOrganizationId,
  canUseHub,
  actionTitle,
}: {
  lenderId: Id<"lenders">;
  lenderOrganizationId?: Id<"organizations">;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const migrationValidation = useQuery(
    api.lenderContactValidation.validateLenderContactMigration,
    {}
  );
  const hydrated = useQuery(api.contactLenderLinks.listByLenderWithContacts, {
    lenderId,
  });
  const allContacts = useQuery(
    api.contacts.list,
    canUseHub
      ? lenderOrganizationId && memberUserKey
        ? {
            organizationId: lenderOrganizationId,
            memberUserKey,
          }
        : "skip"
      : "skip"
  );
  const createContact = useMutation(api.contacts.create);
  const upsertLink = useMutation(api.contactLenderLinks.upsert);
  const removeLink = useMutation(api.contactLenderLinks.remove);

  const [error, setError] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<
    Id<"contacts"> | ""
  >("");
  const [linkRole, setLinkRole] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [linking, setLinking] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<Id<"contactLenderLinks"> | null>(
    null
  );

  useEffect(() => {
    setError(null);
    setSelectedContactId("");
    setLinkRole("");
    setLinkNotes("");
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewRole("");
  }, [lenderId]);

  const linkedIds = useMemo(
    () => new Set((hydrated ?? []).map((h) => h.link.contactId)),
    [hydrated]
  );
  const availableContacts = useMemo(
    () => (allContacts ?? []).filter((c) => !linkedIds.has(c._id)),
    [allContacts, linkedIds]
  );

  async function submitLinkExisting() {
    if (!canUseHub) return;
    if (!selectedContactId) {
      setError("Choose a contact to link.");
      return;
    }
    const role = linkRole.trim();
    if (!role) {
      setError("Role is required.");
      return;
    }
    setError(null);
    setLinking(true);
    try {
      await upsertLink({
        contactId: selectedContactId,
        lenderId,
        role,
        notes: linkNotes.trim() || undefined,
        ...(memberUserKey ? { memberUserKey } : {}),
      });
      setSelectedContactId("");
      setLinkRole("");
      setLinkNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  async function submitCreateAndLink() {
    if (!canUseHub) return;
    const name = newName.trim();
    const role = newRole.trim();
    if (!name) {
      setError("Name is required for a new contact.");
      return;
    }
    if (!role) {
      setError("Role is required.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const contactId = await createContact({
        name,
        ...contactMethodsCreateArgs({
          email: newEmail,
          phone: newPhone,
        }),
        notes: undefined,
        ...(lenderOrganizationId && memberUserKey
          ? {
              organizationId: lenderOrganizationId,
              memberUserKey,
            }
          : {}),
      });
      await upsertLink({
        contactId,
        lenderId,
        role,
        notes: undefined,
        ...(memberUserKey ? { memberUserKey } : {}),
      });
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewRole("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="flex items-center gap-2 normal-case text-foreground">
          <UserCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Lender contacts
        </span>
      }
      description="People and numbers for this lender live in your global Contacts workspace (linked here with a role). Legacy CSV columns and embedded contact arrays remain on the lender row for imports and background use until a future database cleanup."
    >
      {migrationValidation && !migrationValidation.ok ? (
        <p
          className="mb-3 rounded-md border border-destructive/45 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="status"
        >
          Global lender↔contacts validation failed — see{" "}
          <Link href="/settings#data" className="font-medium underline">
            Settings → Data and connectivity
          </Link>{" "}
          for details. Do not treat migrated links as authoritative until resolved.
        </p>
      ) : null}
      {!canUseHub && (
        <p
          className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {actionTitle(
            "Connect to Convex to link or create contacts for this lender."
          )}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/contacts"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open Contacts page
        </Link>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {hydrated === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : hydrated.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
          No linked contacts yet.
        </p>
      ) : (
        <ul className="mb-4 space-y-3" role="list">
          {hydrated.map(({ link, contact }) => (
            <li
              key={link._id}
              className="rounded-md border border-border/70 bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {contact?.name ?? "(Removed contact)"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(() => {
                      if (!contact) return null;
                      const email = resolvePreferredEmail(contact);
                      const phone = resolvePreferredPhone(contact);
                      return (
                        <>
                          {email ? (
                            <a
                              href={`mailto:${email}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Mail className="h-3 w-3" /> {email}
                            </a>
                          ) : null}
                          {phone ? (
                            <a
                              href={`tel:${phone.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Phone className="h-3 w-3" /> {phone}
                            </a>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={!canUseHub || busyLinkId === link._id}
                  title={actionTitle("Remove this contact link")}
                  onClick={async () => {
                    setError(null);
                    setBusyLinkId(link._id);
                    try {
                      await removeLink({
                        id: link._id,
                        ...(memberUserKey ? { memberUserKey } : {}),
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusyLinkId(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  {canUseHub ? (
                    <InlineText
                      value={link.role}
                      onCommit={async (next) => {
                        const r = next.trim();
                        if (!r) return;
                        setError(null);
                        setBusyLinkId(link._id);
                        try {
                          await upsertLink({
                            contactId: link.contactId,
                            lenderId,
                            role: r,
                            notes: link.notes,
                            ...(memberUserKey ? { memberUserKey } : {}),
                          });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setBusyLinkId(null);
                        }
                      }}
                      ariaLabel={`Role for ${contact?.name ?? "contact"} at this lender`}
                      placeholder="rep, account manager…"
                      displayClassName="text-sm"
                    />
                  ) : (
                    <p className="mt-1 text-sm">{link.role}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Link notes
                  </Label>
                  {canUseHub ? (
                    <InlineTextarea
                      value={link.notes ?? ""}
                      onCommit={async (next) => {
                        setError(null);
                        setBusyLinkId(link._id);
                        try {
                          await upsertLink({
                            contactId: link.contactId,
                            lenderId,
                            role: link.role,
                            notes: next.trim() || undefined,
                            ...(memberUserKey ? { memberUserKey } : {}),
                          });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setBusyLinkId(null);
                        }
                      }}
                      ariaLabel={`Notes for ${contact?.name ?? "contact"} at this lender`}
                      placeholder="Optional"
                      rows={2}
                      displayClassName="text-sm"
                    />
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {link.notes?.trim() ? link.notes : "—"}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-md border border-border/70 bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link existing contact
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={selectedContactId}
            onChange={(e) =>
              setSelectedContactId(e.target.value as Id<"contacts"> | "")
            }
            disabled={!canUseHub}
            aria-label="Select contact to link to lender"
          >
            <option value="">Choose contact…</option>
            {availableContacts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Role (required)"
            value={linkRole}
            onChange={(e) => setLinkRole(e.target.value)}
            disabled={!canUseHub}
            title={actionTitle("Role for this contact at the lender")}
          />
          <Input
            placeholder="Optional link notes"
            value={linkNotes}
            onChange={(e) => setLinkNotes(e.target.value)}
            disabled={!canUseHub}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={
              !canUseHub ||
              !selectedContactId ||
              !linkRole.trim() ||
              linking
            }
            onClick={() => void submitLinkExisting()}
          >
            {linking ? "Linking…" : "Link contact"}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-dashed border-border/80 bg-muted/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Create &amp; link new contact
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            placeholder="Name (required)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={!canUseHub}
          />
          <Input
            placeholder="Role on this lender (required)"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            disabled={!canUseHub}
          />
          <Input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={!canUseHub}
          />
          <Input
            placeholder="Phone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            disabled={!canUseHub}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={
              !canUseHub ||
              !newName.trim() ||
              !newRole.trim() ||
              creating
            }
            onClick={() => void submitCreateAndLink()}
          >
            {creating ? "Creating…" : "Create and link"}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}

type LenderFileRow = {
  _id: Id<"lenderAttachments">;
  _creationTime: number;
  fileName: string;
  contentType: string | undefined;
  size: number | undefined;
  label: string | undefined;
  createdAt: number;
  url: string | null;
};

function LenderAttachmentsPanel({
  lenderId,
  canUseHub,
  actionTitle,
}: {
  lenderId: Id<"lenders">;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const { confirm } = useOperationalConfirm();
  const files = useQuery(api.lenderFiles.list, { lenderId });
  const generateUploadUrl = useMutation(api.lenderFiles.generateUploadUrl);
  const addFileM = useMutation(api.lenderFiles.addFile);
  const removeFileM = useMutation(api.lenderFiles.removeFile);
  const updateFileLabelM = useMutation(api.lenderFiles.updateFileLabel);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<LenderFileRow | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function formatSize(n: number | undefined) {
    if (n == null || n < 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function processFiles(raw: File[]) {
    if (!raw.length || !canUseHub) return;

    setUploading(true);
    setErr(null);
    try {
      const { ok, failures, attempted } = await uploadLocalFilesViaConvexUrl({
        files: raw,
        generateUploadUrl: () => generateUploadUrl({}),
        onProgress: (current, total) =>
          setUploadProgress({ current, total }),
        commitEach: async ({ storageId, fileName, contentType, size }) => {
          await addFileM({
            lenderId,
            storageId: storageId as Id<"_storage">,
            fileName,
            contentType,
            size,
          });
        },
      });
      if (failures.length > 0) {
        if (ok === 0) {
          setErr(
            attempted > 1
              ? `Upload failed: ${failures.join("; ")}`
              : failures[0] ?? "Upload failed"
          );
        } else {
          setErr(
            `Uploaded ${ok} of ${attempted} file(s). Not attached: ${failures.join("; ")}`
          );
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const list = input.files;
    const arr = list ? Array.from(list) : [];
    await processFiles(arr);
    input.value = "";
  }

  function onDropFiles(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!canUseHub || uploading) return;
    const dt = e.dataTransfer.files;
    void processFiles(Array.from(dt));
  }

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="flex items-center gap-2 normal-case">
          <Paperclip className="h-3.5 w-3.5" aria-hidden />
          Files &amp; documents
        </span>
      }
      description="Attach term sheets, guidelines, or other documents. You can select multiple files at once. Use Preview to view images, PDFs, and text in the app."
    >
      <AttachmentPreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        actionTitle={actionTitle}
      />
      {!canUseHub && (
        <p
          className="mb-3 rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          Connect to Convex (wait for the live connection) to upload or remove
          files. Viewing may still work for files that already have a URL.
        </p>
      )}
      <p className="mb-2 text-xs text-muted-foreground">
        Per file up to{" "}
        {Math.round(MAX_LENDER_ATTACHMENT_BYTES / (1024 * 1024))} MB. Drag and
        drop here or use Add file(s) — both accept the same file types (any
        type your device allows in the picker). PDFs, images, Office docs, and
        HEIC/HEIF are common.
      </p>
      <div
        className={`mb-3 rounded-md border border-dashed p-3 transition-colors ${
          dragActive && canUseHub && !uploading
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-muted/10"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading) setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canUseHub && !uploading) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragActive(false);
        }}
        onDrop={onDropFiles}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Drop files here when connected</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Drop files here to attach</span>
          </div>
          <div className="relative inline-flex h-8 shrink-0 sm:ml-auto">
            {/*
              Overlay the file input on the button so the OS file picker opens from a
              real click on the control (parity with drag-and-drop; avoids broken
              programmatic `.click()` on clipped `sr-only` inputs, especially mobile).
            */}
            <input
              type="file"
              multiple
              disabled={!canUseHub || uploading}
              onChange={onPickFile}
              className="absolute inset-0 z-10 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Upload files to this profile — browse device"
              title={actionTitle("Add one or more files to this profile")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none relative z-0 min-w-[6.5rem]"
              disabled={!canUseHub || uploading}
            >
              {uploading
                ? uploadProgress
                  ? `Uploading ${uploadProgress.current} / ${uploadProgress.total}…`
                  : "Uploading…"
                : "Add file(s)"}
            </Button>
          </div>
        </div>
      </div>
      {err && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
      {files === undefined ? (
        <p className="text-sm text-muted-foreground">Loading attachments…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached yet.</p>
      ) : (
        <ul className="space-y-3" aria-label="Attached files">
          {(files as LenderFileRow[]).map((a) => (
            <li
              key={a._id}
              className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <FileText
                className="hidden h-8 w-8 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {a.fileName}
                  </span>
                  {a.url && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setPreviewFile(a)}
                        title={actionTitle("Preview in app")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <a
                        href={a.url}
                        download={a.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-primary hover:bg-muted"
                        title={actionTitle("Open in new tab")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(a.size)}
                  {a.contentType
                    ? ` · ${a.contentType}`
                    : ""}
                </div>
                <div className="pt-0.5">
                  <Input
                    key={`${a._id}-label`}
                    className="h-8 text-xs"
                    placeholder="Optional label (e.g. 2024 rate sheet)"
                    defaultValue={a.label ?? ""}
                    title={actionTitle("Short label for this file")}
                    readOnly={!canUseHub}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      const cur = a.label?.trim() ?? "";
                      if (next === cur) return;
                      void updateFileLabelM({ id: a._id, label: next || undefined });
                    }}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 self-end text-destructive hover:bg-destructive/10"
                disabled={!canUseHub}
                onClick={() => {
                  void (async () => {
                    const ok = await confirm(
                      unlinkConfirm(
                        a.fileName,
                        "This file is removed from this lender. Other records are not affected.",
                      ),
                    );
                    if (!ok) return;
                    void removeFileM({ id: a._id });
                  })();
                }}
                title={actionTitle("Remove file")}
                aria-label={`Remove ${a.fileName}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="text-sm font-semibold normal-case text-foreground">
          {title}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {children}
      </div>
    </CollapsibleSection>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="text-sm leading-5">{v}</div>
    </div>
  );
}
