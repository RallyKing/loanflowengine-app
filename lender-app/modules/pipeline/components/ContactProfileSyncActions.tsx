"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { useDealWorkspaceEditor } from "@/lib/file/useDealWorkspaceEditor";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";

export type ContactProfileSyncActionsProps = {
  target: "borrower" | "guarantor";
  slotIndex: number;
  /** When set, pull uses this CRM contact directly. */
  contactId?: Id<"contacts"> | null;
  className?: string;
};

export function ContactProfileSyncActions({
  target,
  slotIndex,
  contactId: contactIdProp,
  className,
}: ContactProfileSyncActionsProps) {
  const { fileId, dealBundle } = useDealWorkspaceEditor();
  const { accountId } = useUserPreferences();
  const memberKey = accountId.trim();

  const [selectedContactId, setSelectedContactId] =
    useState<Id<"contacts"> | "">("");
  const [busy, setBusy] = useState<"pull" | "push" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgId = dealBundle?.pipeline?.organizationId;
  const fileUpdatedAt = dealBundle?.pipeline?.updatedAt;

  const contacts = useQuery(
    api.contacts.list,
    orgId && memberKey
      ? { organizationId: orgId, memberUserKey: memberKey }
      : "skip",
  );

  const pullProfile = useMutation(
    api.pipelineContacts.pullContactFinancialProfileToDeal,
  );
  const pushProfile = useMutation(
    api.pipelineContacts.pushDealFinancialProfileToContact,
  );

  const effectiveContactId =
    contactIdProp ?? (selectedContactId || null);

  const contactOptions = useMemo(() => {
    if (!Array.isArray(contacts)) return [];
    return contacts
      .map((c) => ({ id: c._id, name: c.name?.trim() || "Contact" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  const onPull = useCallback(async () => {
    if (!fileId || !effectiveContactId || fileUpdatedAt == null) {
      setError("Select a CRM contact before pulling.");
      return;
    }
    setBusy("pull");
    setError(null);
    setMessage(null);
    try {
      const result = await pullProfile({
        fileId,
        contactId: effectiveContactId,
        target,
        slotIndex,
        expectedUpdatedAt: fileUpdatedAt,
        preferencesAccountId: memberKey || undefined,
      });
      if (isPatchDealConflictResult(result)) {
        setError("Deal changed elsewhere — refresh and try again.");
        return;
      }
      setMessage("CRM financial profile pulled into this deal.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [
    effectiveContactId,
    fileId,
    fileUpdatedAt,
    memberKey,
    pullProfile,
    slotIndex,
    target,
  ]);

  const onPush = useCallback(async () => {
    if (!fileId || fileUpdatedAt == null) return;
    setBusy("push");
    setError(null);
    setMessage(null);
    try {
      const result = await pushProfile({
        fileId,
        target,
        slotIndex,
        expectedUpdatedAt: fileUpdatedAt,
        preferencesAccountId: memberKey || undefined,
      });
      if (isPatchDealConflictResult(result)) {
        setError("Deal changed elsewhere — refresh and try again.");
        return;
      }
      setMessage("Deal financial profile synced to CRM.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [
    fileId,
    fileUpdatedAt,
    memberKey,
    pushProfile,
    slotIndex,
    target,
  ]);

  if (!fileId) return null;

  return (
    <div
      className={className}
      data-testid={`contact-profile-sync-${target}-${slotIndex}`}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-dlc-lg border border-border/80 bg-dlc-surface-container-lowest px-3 py-2.5">
        {!contactIdProp ? (
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 font-medium">CRM contact</span>
            <select
              className="min-w-0 flex-1 rounded-dlc-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              value={selectedContactId}
              onChange={(e) =>
                setSelectedContactId(e.currentTarget.value as Id<"contacts"> | "")
              }
              aria-label="CRM contact for profile pull"
            >
              <option value="">Select contact…</option>
              {contactOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !effectiveContactId}
          onClick={() => void onPull()}
        >
          <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {busy === "pull" ? "Pulling…" : "Pull CRM profile"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void onPush()}
        >
          <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {busy === "push" ? "Syncing…" : "Sync to CRM profile"}
        </Button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
