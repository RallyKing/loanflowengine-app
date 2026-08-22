"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

export function LenderPortalCredentialsCard({
  lenderId,
  canUseHub,
  actionTitle,
}: {
  lenderId: Id<"lenders">;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const orgScope = useOrgConvexQueryArgs();
  const { confirm } = useOperationalConfirm();
  const [revealPassword, setRevealPassword] = useState(false);
  const creds = useQuery(
    api.lenderPortalCredentials.get,
    orgScope
      ? {
          lenderId,
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          revealPassword,
        }
      : "skip",
  );
  const upsert = useMutation(api.lenderPortalCredentials.upsert);
  const remove = useMutation(api.lenderPortalCredentials.remove);

  const [portalUrl, setPortalUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    setRevealPassword(false);
    setPasswordDirty(false);
    setPassword("");
    setMsg(null);
  }, [lenderId]);

  useEffect(() => {
    if (!creds) {
      if (creds === null) {
        setPortalUrl("");
        setUsername("");
        setNotes("");
      }
      return;
    }
    setPortalUrl(creds.portalUrl ?? "");
    setUsername(creds.username ?? "");
    setNotes(creds.notes ?? "");
    if (revealPassword && creds.password !== undefined) {
      setPassword(creds.password);
      setPasswordDirty(false);
    }
  }, [creds, revealPassword]);

  async function save() {
    if (!orgScope || !canUseHub) return;
    setSaving(true);
    setMsg(null);
    try {
      await upsert({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        lenderId,
        portalUrl,
        username,
        notes,
        ...(passwordDirty
          ? password.trim()
            ? { password }
            : { clearPassword: true }
          : {}),
      });
      setPasswordDirty(false);
      if (!password.trim()) setPassword("");
      setMsg("Partner portal credentials saved.");
      setRevealPassword(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!orgScope || !canUseHub) return;
    const ok = await confirm(
      simpleDeleteConfirm("partner portal credentials", {
        title: "Remove portal credentials",
        impact: "Username and password for this lender portal are deleted.",
        confirmLabel: "Remove",
      }),
    );
    if (!ok) return;
    setSaving(true);
    try {
      await remove({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        lenderId,
      });
      setPortalUrl("");
      setUsername("");
      setPassword("");
      setNotes("");
      setPasswordDirty(false);
      setMsg("Credentials removed.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not remove credentials.");
    } finally {
      setSaving(false);
    }
  }

  const portalHref = portalUrl.trim()
    ? portalUrl.startsWith("http")
      ? portalUrl
      : `https://${portalUrl}`
    : null;

  return (
    <CollapsibleSection
      variant="card"
      defaultOpen
      title={
        <span className="flex items-center gap-2 normal-case text-foreground">
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          Partner portal
        </span>
      }
      description="Save the lender’s partner portal URL and login so your team can reopen it without hunting through email. Credentials are org-scoped and encrypted at rest when encryption is configured."
    >
      {msg && (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Portal URL</Label>
          <div className="mt-1 flex gap-2">
            <Input
              className="flex-1"
              placeholder="https://partners.example.com"
              value={portalUrl}
              onChange={(e) => setPortalUrl(e.target.value)}
              disabled={!canUseHub}
              title={actionTitle("Partner portal URL")}
            />
            {portalHref && (
              <a
                href={portalHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1 rounded-md border border-input px-2 text-xs text-primary hover:bg-muted"
                title={actionTitle("Open partner portal")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            )}
          </div>
        </div>
        <div>
          <Label>Username</Label>
          <Input
            className="mt-1"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!canUseHub}
          />
        </div>
        <div>
          <Label>
            Password
            {creds?.hasPassword && !passwordDirty
              ? " (saved — enter to replace)"
              : ""}
          </Label>
          <div className="mt-1 flex gap-1">
            <Input
              className="flex-1"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              placeholder={
                creds?.hasPassword && !passwordDirty ? "••••••••" : ""
              }
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordDirty(true);
              }}
              disabled={!canUseHub}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 px-2"
              onClick={() => setShowPw((v) => !v)}
              title={showPw ? "Hide password" : "Show typed password"}
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {creds?.hasPassword && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-8 px-2 text-xs"
              disabled={!canUseHub}
              onClick={() => {
                setRevealPassword(true);
                setShowPw(true);
              }}
              title={actionTitle("Reveal saved password")}
            >
              Reveal saved password
            </Button>
          )}
        </div>
        <div className="sm:col-span-2">
          <Label>Notes (optional)</Label>
          <Textarea
            className="mt-1"
            rows={2}
            placeholder="MFA app, which branch login, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canUseHub}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {creds && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canUseHub || saving}
            onClick={() => void clearAll()}
            title={actionTitle("Remove all portal credentials")}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
            Clear
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!canUseHub || saving}
          onClick={() => void save()}
          title={actionTitle("Save partner portal credentials")}
        >
          {saving ? "Saving…" : "Save credentials"}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
