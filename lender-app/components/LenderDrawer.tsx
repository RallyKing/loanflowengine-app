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
  Sparkles,
  GitMerge,
  StickyNote,
  Maximize2,
  Minimize2,
  UserCircle2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { Input, Label, Select, Textarea } from "./ui/Input";
import { SearchField } from "./ui/SearchField";
import { Badge } from "./ui/Badge";
import { Stars } from "./ui/Stars";
import { ENTITY_TYPES, type Lender, type Program } from "@/lib/schema";
import {
  contactMethodsCreateArgs,
  resolvePreferredEmail,
  resolvePreferredPhone,
} from "@/lib/contact/contactMethods";
import { cn } from "@/lib/cn";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useOrgConvexQueryArgs, type OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { InlineText, InlineTextarea } from "@/components/inline";
import {
  RecordInspectorBody,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSkeleton,
} from "@/components/RecordInspectorShell";
import { useWorkspaceSheetDragLock } from "@/components/PipelineWorkspaceMobileVaulFrame";
import { CommunicationHistoryPanel } from "@/components/communications/CommunicationHistoryPanel";
import { UnifiedCommunicationPanel } from "@/components/communications/UnifiedCommunicationPanel";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import {
  LenderProfileTabBar,
  type LenderProfileTabId,
} from "@/components/lender/LenderProfileTabBar";
import { LenderPortalCredentialsCard } from "@/components/lender/LenderPortalCredentialsCard";
import { LenderProgramsTab } from "@/components/lender/LenderProgramsTab";
import { LenderTemplatesTab } from "@/components/lender/LenderTemplatesTab";
import { LenderDocsTab } from "@/components/lender/LenderDocsTab";

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
  const [profileTab, setProfileTab] = useState<LenderProfileTabId>("overview");

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
    setProfileTab("overview");
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
    if (!draft || !orgScope) return;
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
        ...orgScope,
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
    if (!draft || !id || !orgScope) return;
    setDraft({ ...draft, rating: stars } as Lender);
    try {
      await rate({ id: id as Id<"lenders">, rating: stars, ...orgScope });
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
    if (merging || !orgScope) return;
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
      const res = await mergeLendersM({ keepId, removeId, ...orgScope });
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
    if (!orgScope) return;
    await remove({ id: id as Id<"lenders">, ...orgScope });
    onClose();
  }

  const noteDelta =
    (profileNotes || "").trim() !== (lender?.notes ?? "").trim();
  async function saveProfileNotes() {
    if (!id) return;
    if (!canUseHub || !noteDelta) return;
    setSavingNotes(true);
    try {
      if (!orgScope) return;
      await setNotesM({ id, notes: profileNotes, ...orgScope });
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
          <LenderProfileTabBar active={profileTab} onChange={setProfileTab} />

          {profileTab === "overview" && (
            <div className="space-y-5" role="tabpanel" aria-label="Overview">
              <CollapsibleSection
                variant="card"
                defaultOpen
                title={
                  <span className="flex items-center gap-2 normal-case text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Website &amp; company info
                  </span>
                }
              >
                {editing ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Company</Label>
                      <Input
                        className="mt-1"
                        value={draft.company ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, company: e.target.value } as Lender)
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Website</Label>
                      <Input
                        className="mt-1"
                        placeholder="https://…"
                        value={draft.website ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, website: e.target.value } as Lender)
                        }
                      />
                    </div>
                    <div>
                      <Label>Entity type</Label>
                      <Select
                        className="mt-1"
                        value={draft.entityType ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            entityType: e.target.value,
                          } as Lender)
                        }
                      >
                        <option value="">(auto-classify)</option>
                        {ENTITY_TYPES.map((ent) => (
                          <option key={ent} value={ent}>
                            {ent}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Input
                        className="mt-1"
                        value={draft.status ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, status: e.target.value } as Lender)
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 text-sm">
                      {draft.website ? (
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
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No website on file. Tap Edit to add one.
                        </p>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Reps are managed under Lender contacts (CRM links with roles).
                      Partner portal logins are saved separately below.
                    </p>
                  </div>
                )}
              </CollapsibleSection>

              <LenderPortalCredentialsCard
                lenderId={id}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />

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
                description="Searchable notes for this lender."
              >
                {editing ? (
                  <Textarea
                    className="min-h-[5.5rem] text-sm"
                    value={draft.notes ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value } as Lender)
                    }
                    rows={4}
                  />
                ) : (
                  <>
                    <Textarea
                      className="min-h-[5.5rem] text-sm"
                      value={profileNotes}
                      onChange={(e) => {
                        setProfileNotes(e.target.value);
                        setProfileNotesDirty(true);
                      }}
                      readOnly={!canUseHub}
                      title={
                        !canUseHub
                          ? actionTitle("Add notes to this profile")
                          : undefined
                      }
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
                  </>
                )}
              </CollapsibleSection>

              {draft.organizationId ? (
                <CollapsibleSection
                  variant="card"
                  defaultOpen={false}
                  title={
                    <span className="flex items-center gap-2 normal-case text-foreground">
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Communication hub
                    </span>
                  }
                >
                  <div className="space-y-4">
                    <UnifiedCommunicationPanel
                      organizationId={draft.organizationId}
                      memberUserKey={accountId.trim() || undefined}
                      relatedLenderId={id ?? undefined}
                      hideHistory
                      defaultChannel="email"
                    />
                    <CommunicationHistoryPanel
                      organizationId={draft.organizationId}
                      memberUserKey={accountId.trim() || undefined}
                      relatedLenderId={id ?? undefined}
                      emptyLabel="No outbound communication logged for this lender yet."
                      maxHeightClassName="max-h-56"
                    />
                  </div>
                </CollapsibleSection>
              ) : null}

              <Section title="Deal Parameters">
                {editing ? (
                  <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["statesServed", "States Served"],
                        ["ownerOrInvestor", "Owner / Investor"],
                        ["fundingAmountMin", "Funding min"],
                        ["fundingAmountMax", "Funding max"],
                        ["minFico", "Min FICO"],
                        ["ltv", "LTV / Leverage"],
                        ["interestRates", "Interest Rates"],
                        ["amortTerm", "Amortization / Term"],
                        ["referralFees", "Referral / YSP Fees"],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <Label>{label}</Label>
                        <Input
                          className="mt-1"
                          value={
                            (draft as unknown as Record<string, string>)[field] ??
                            ""
                          }
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [field]: e.target.value,
                            } as Lender)
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </Section>

              {editing && (
                <CollapsibleSection
                  variant="card"
                  defaultOpen={false}
                  title={
                    <span className="text-sm font-semibold normal-case text-foreground">
                      Rating notes
                    </span>
                  }
                >
                  <div className="flex items-center gap-3">
                    <Stars
                      value={draft.rating ?? 0}
                      onChange={(n) =>
                        setDraft({ ...draft, rating: n } as Lender)
                      }
                      size="lg"
                    />
                  </div>
                  <div className="mt-3">
                    <Label>Rating notes</Label>
                    <Textarea
                      rows={2}
                      value={draft.ratingNotes ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ratingNotes: e.target.value,
                        } as Lender)
                      }
                    />
                  </div>
                </CollapsibleSection>
              )}

              {(draft.ratingNotes ||
                (draft.enrichmentSources &&
                  draft.enrichmentSources.length > 0) ||
                draft.enrichedAt) &&
                !editing && (
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
                  description="Search for a second lender, then pick which company row to keep."
                >
                  {mergeMsg && (
                    <p className="mb-2 text-xs text-destructive" role="alert">
                      {mergeMsg}
                    </p>
                  )}
                  <SearchField
                    placeholder="Type 2+ characters to search…"
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
                              mergeTarget === r._id && "bg-muted font-medium",
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
                  {mergeTarget && (
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={!canUseHub || merging}
                        onClick={() =>
                          void runMerge(id as Id<"lenders">, mergeTarget)
                        }
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
                      >
                        {merging
                          ? "Merging…"
                          : "Use the selected result as the main record"}
                      </Button>
                    </div>
                  )}
                </CollapsibleSection>
              )}

              <Section title="Metadata">
                <Field k="Source" v={draft.source} />
                <Field k="Section" v={draft.section} />
                <Field k="Last Updated" v={draft.lastUpdated} />
              </Section>
            </div>
          )}

          {profileTab === "programs" && (
            <div role="tabpanel" aria-label="Programs">
              <LenderProgramsTab
                draft={draft}
                editing={editing}
                canUseHub={canUseHub}
                onAddProgram={addProgram}
                onRemoveProgram={removeProgram}
                onPatchProgram={patchProgram}
                onPatchField={(field, value) =>
                  setDraft({ ...draft, [field]: value } as Lender)
                }
              />
            </div>
          )}

          {profileTab === "templates" && (
            <div role="tabpanel" aria-label="Templates">
              <LenderTemplatesTab
                lenderId={id}
                lenderCompany={draft.company}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />
            </div>
          )}

          {profileTab === "docs" && (
            <div role="tabpanel" aria-label="Docs">
              <LenderDocsTab
                lenderId={id}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />
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
