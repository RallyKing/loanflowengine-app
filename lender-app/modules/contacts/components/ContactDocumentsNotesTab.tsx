"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileText, FolderLock, Plus, UserPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { LibraryDocumentsPanel } from "@/components/LibraryDocumentsPanel";
import { CommunicationHistoryPanel } from "@/components/communications/CommunicationHistoryPanel";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { cn } from "@/lib/cn";
import {
  CRM_NOTE_CATEGORIES,
  crmNoteCategoryLabel,
  type CrmNoteCategoryId,
} from "@/lib/contacts/crmNoteCategories";

function activityKindLabel(kind: string): string {
  switch (kind) {
    case "note":
      return "Note";
    case "call":
      return "Call";
    case "email":
      return "Email";
    case "meeting":
      return "Meeting";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

type ContactDocumentsNotesTabProps =
  | {
      scope: "contact";
      contactId: Id<"contacts">;
      organizationId: Id<"organizations">;
      memberUserKey: string;
      canUseHub: boolean;
    }
  | {
      scope: "entity";
      entityId: Id<"clients">;
      organizationId: Id<"organizations">;
      memberUserKey: string;
      canUseHub: boolean;
      vaultContactId?: Id<"contacts"> | null;
      vaultContactName?: string | null;
    };

export function ContactDocumentsNotesTab(props: ContactDocumentsNotesTabProps) {
  const isContact = props.scope === "contact";
  const memberUserKey = props.memberUserKey;
  const contactId = isContact ? props.contactId : null;
  const entityId = !isContact ? props.entityId : null;

  const contactActivityRows = useQuery(
    api.contactActivity.listForContact,
    isContact
      ? {
          contactId: contactId!,
          limit: 80,
          memberUserKey,
        }
      : "skip",
  );

  const entityActivityRows = useQuery(
    api.entityActivity.listForEntity,
    !isContact
      ? {
          clientId: entityId!,
          limit: 80,
          memberUserKey,
        }
      : "skip",
  );

  const activityRows = isContact ? contactActivityRows : entityActivityRows;

  const addContactActivity = useMutation(api.contactActivity.addManual);
  const addEntityActivity = useMutation(api.entityActivity.addManual);

  const [activityKind, setActivityKind] = useState<
    "note" | "call" | "email" | "meeting"
  >("note");
  const [noteCategory, setNoteCategory] = useState<CrmNoteCategoryId>("general");
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDetail, setActivityDetail] = useState("");
  const [activityBusy, setActivityBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CrmNoteCategoryId | "all">(
    "all",
  );

  const onAddActivity = useCallback(async () => {
    if (!activitySummary.trim()) return;
    setActivityBusy(true);
    try {
      if (isContact && contactId) {
        await addContactActivity({
          contactId,
          kind: activityKind,
          summary: activitySummary.trim(),
          detail: activityDetail.trim() || undefined,
          noteCategory: activityKind === "note" ? noteCategory : undefined,
          memberUserKey,
        });
      } else if (entityId) {
        await addEntityActivity({
          clientId: entityId,
          kind: activityKind,
          summary: activitySummary.trim(),
          detail: activityDetail.trim() || undefined,
          noteCategory: activityKind === "note" ? noteCategory : undefined,
          memberUserKey,
        });
      }
      setActivitySummary("");
      setActivityDetail("");
    } finally {
      setActivityBusy(false);
    }
  }, [
    activityDetail,
    activityKind,
    activitySummary,
    addContactActivity,
    addEntityActivity,
    isContact,
    noteCategory,
    contactId,
    entityId,
    memberUserKey,
  ]);

  const filteredNotes = useMemo(() => {
    if (!activityRows) return undefined;
    const notes = activityRows.filter((row) => row.kind === "note");
    if (categoryFilter === "all") return notes;
    return notes.filter((row) => (row.noteCategory ?? "general") === categoryFilter);
  }, [activityRows, categoryFilter]);

  const nonNoteActivity = useMemo(() => {
    if (!activityRows) return undefined;
    return activityRows.filter((row) => row.kind !== "note");
  }, [activityRows]);

  const notesSection = (
    <div className="space-y-4 rounded-dlc-lg border border-slate-200 bg-dlc-surface p-5">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>CRM notes</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Categorized notes for commission, referral agreements, and general
            correspondence.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "rounded-dlc-full px-3 py-1 text-dlc-label-md font-medium transition-colors duration-dlc-short",
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
        >
          All notes
        </button>
        {CRM_NOTE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={cn(
              "rounded-dlc-full px-3 py-1 text-dlc-label-md font-medium transition-colors duration-dlc-short",
              categoryFilter === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 rounded-dlc-md border border-slate-200 bg-muted/10 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label>
            Type
            <select
              className="mt-1.5 flex h-10 w-full rounded-dlc-md border border-input bg-background px-3 text-sm"
              value={activityKind}
              onChange={(e) =>
                setActivityKind(e.currentTarget.value as typeof activityKind)
              }
              aria-label="Activity type"
            >
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </Label>
          {activityKind === "note" ? (
            <Label>
              Category
              <select
                className="mt-1.5 flex h-10 w-full rounded-dlc-md border border-input bg-background px-3 text-sm"
                value={noteCategory}
                onChange={(e) =>
                  setNoteCategory(e.currentTarget.value as CrmNoteCategoryId)
                }
                aria-label="Note category"
              >
                {CRM_NOTE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </Label>
          ) : null}
        </div>
        <Label htmlFor="docs-notes-summary">
          Summary
          <Input
            id="docs-notes-summary"
            value={activitySummary}
            onChange={(e) => setActivitySummary(e.currentTarget.value)}
            placeholder="Short title"
            className="mt-1.5"
          />
        </Label>
        <Label htmlFor="docs-notes-detail">
          Detail
          <Textarea
            id="docs-notes-detail"
            value={activityDetail}
            onChange={(e) => setActivityDetail(e.currentTarget.value)}
            rows={3}
            placeholder="Optional details…"
            className="mt-1.5"
          />
        </Label>
        <div>
          <Button
            type="button"
            size="sm"
            onClick={() => void onAddActivity()}
            disabled={activityBusy || !activitySummary.trim()}
          >
            {activityBusy ? "Saving…" : "Add note / log activity"}
          </Button>
        </div>
      </div>

      {filteredNotes === undefined ? (
        <p className={hubDetailStyles.sectionHint}>Loading notes…</p>
      ) : filteredNotes.length === 0 ? (
        <p className={hubDetailStyles.sectionHint}>
          No notes in this category yet.
        </p>
      ) : (
        <ul className="max-h-80 touch-scroll-y space-y-2 overflow-y-auto pr-1" role="list">
          {filteredNotes.map((row) => (
            <li
              key={row._id}
              className="rounded-dlc-md border border-slate-200 bg-background px-4 py-3 text-sm transition-colors duration-dlc-short hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {crmNoteCategoryLabel(row.noteCategory)}
                  </span>
                </div>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(row.at).toISOString()}
                >
                  {new Date(row.at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 font-medium text-foreground">{row.summary}</p>
              {row.detail ? (
                <p className="mt-1 whitespace-pre-wrap text-dlc-body-sm text-muted-foreground">
                  {row.detail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nonNoteActivity && nonNoteActivity.length > 0 ? (
        <div className="space-y-2 border-t border-slate-200 pt-4">
          <p className="text-dlc-label-md font-semibold text-muted-foreground">
            Calls, emails & meetings
          </p>
          <ul className="space-y-2" role="list">
            {nonNoteActivity.slice(0, 8).map((row) => (
              <li
                key={row._id}
                className="rounded-dlc-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{activityKindLabel(row.kind)}</span>
                <span className="text-muted-foreground"> — {row.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const vaultSection = isContact ? (
    <div className="space-y-4 rounded-dlc-lg border border-slate-200 bg-dlc-surface p-5">
      <div className="flex items-start gap-3">
        <FolderLock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Document vault</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Driver&apos;s licenses, operating agreements, W-9s, and other KYC
            artifacts. View or download any uploaded file.
          </p>
        </div>
      </div>
      <LibraryDocumentsPanel
        context={{ kind: "contact", contactId: props.contactId }}
        memberUserKey={props.memberUserKey}
        canUseHub={props.canUseHub}
        actionTitle={(h) => h}
        defaultOpen
      />
      <CommunicationHistoryPanel
        organizationId={props.organizationId}
        memberUserKey={props.memberUserKey}
        relatedContactId={props.contactId}
        emptyLabel="No outbound communication logged for this contact yet."
        maxHeightClassName="max-h-48"
      />
    </div>
  ) : (
    <div className="space-y-4 rounded-dlc-lg border border-slate-200 bg-dlc-surface p-5">
      <div className="flex items-start gap-3">
        <FolderLock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 className={hubDetailStyles.sectionTitle}>Document vault</h3>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Entity KYC and corporate documents. Files upload to the entity&apos;s
            designated contact profile vault.
          </p>
        </div>
      </div>
      {props.vaultContactId ? (
        <>
          {props.vaultContactName ? (
            <p className="text-dlc-body-sm text-muted-foreground">
              Vault contact:{" "}
              <Link
                href={`/contacts/${props.vaultContactId}`}
                className="font-medium text-primary hover:underline"
              >
                {props.vaultContactName}
              </Link>
            </p>
          ) : null}
          <LibraryDocumentsPanel
            context={{ kind: "contact", contactId: props.vaultContactId }}
            memberUserKey={props.memberUserKey}
            canUseHub={props.canUseHub}
            actionTitle={(h) => h}
            defaultOpen
          />
        </>
      ) : (
        <div className="rounded-dlc-md border border-dashed border-slate-200 bg-muted/20 px-4 py-8 text-center">
          <UserPlus className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="mt-3 text-dlc-body-sm font-medium text-foreground">
            Add a principal to enable the document vault
          </p>
          <p className="mt-1 text-dlc-body-sm text-muted-foreground">
            Link an owner or officer from the Cap Table tab first.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {notesSection}
      {vaultSection}
    </div>
  );
}

export type ContactActivityRow = Doc<"contactActivity"> | Doc<"entityActivity">;
