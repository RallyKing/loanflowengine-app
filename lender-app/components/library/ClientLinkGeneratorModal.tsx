"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Link2, Loader2, Mail } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type ClientLinkGeneratorModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  fileTasks: Doc<"documentVaultFileTasks">[];
  onError: (message: string) => void;
};

type Mode = "all_outstanding" | "selective";

export function ClientLinkGeneratorModal({
  open,
  onClose,
  pipelineFileId,
  organizationId,
  memberUserKey,
  fileTasks,
  onError,
}: ClientLinkGeneratorModalProps) {
  const [mode, setMode] = useState<Mode>("all_outstanding");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [portalUrl, setPortalUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const issueBundle = useMutation(
    api.documentVaultClientBundlePortal.issueBundleToken,
  );
  const sendInvite = useMutation(
    api.documentVaultClientBundlePortal.sendBundleInvite,
  );

  const templates = useQuery(
    api.portalEmailTemplates.listForOrg,
    open && organizationId
      ? { organizationId, kind: "initial_request" as const }
      : "skip",
  );

  const activeTasks = useMemo(
    () =>
      fileTasks.filter(
        (t) => !t.isArchived && t.isPortalVisible && t.status !== "complete",
      ),
    [fileTasks],
  );

  useEffect(() => {
    if (!open) return;
    const tpl = templates?.find((t) => t.isDefault) ?? templates?.[0];
    if (tpl) {
      setSubject(tpl.subject);
      setBodyText(tpl.bodyText);
    }
  }, [open, templates]);

  const toggleTask = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!memberUserKey || busy) return;
    setBusy(true);
    try {
      const result = await issueBundle({
        pipelineFileId,
        mode,
        fileTaskIds:
          mode === "selective"
            ? [...selected].map((id) => id as Id<"documentVaultFileTasks">)
            : undefined,
        memberUserKey,
      });
      setPortalUrl(result.portalUrl);
      showOperationalToast({
        title: "Client link generated",
        description: `${result.fileTaskCount} task(s) included.`,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Link generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      showOperationalToast({ title: "Link copied" });
    } catch {
      onError("Could not copy link.");
    }
  };

  const handleSendInvite = async () => {
    if (!memberUserKey || !portalUrl || inviteBusy) return;
    if (!inviteEmail.trim().includes("@")) {
      onError("Enter a valid email address.");
      return;
    }
    setInviteBusy(true);
    try {
      await sendInvite({
        pipelineFileId,
        to: inviteEmail.trim(),
        subject,
        bodyText,
        portalUrl,
        clientName: clientName.trim() || undefined,
        memberUserKey,
      });
      showOperationalToast({ title: "Invite sent" });
      setShowInvite(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Invite failed.");
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Generate client link"
      panelClassName="w-full max-w-lg p-5"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Link2 className="h-4 w-4" aria-hidden />
        Generate Client Link
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Create a tokenized portal link for outstanding document requests.
      </p>

      <div className="mt-4 flex gap-1 rounded-dlc-md border border-border/70 p-0.5">
        {(["all_outstanding", "selective"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "flex-1 rounded-dlc-sm px-2 py-1.5 text-xs font-medium",
              mode === m
                ? "bg-dlc-surface-high shadow-dlc-1"
                : "text-muted-foreground",
            )}
            onClick={() => setMode(m)}
          >
            {m === "all_outstanding" ? "All Outstanding" : "Selective Tasks"}
          </button>
        ))}
      </div>

      {mode === "selective" ? (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-dlc-md border border-border/60 p-2">
          {activeTasks.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              No portal-visible incomplete tasks.
            </li>
          ) : (
            activeTasks.map((task) => (
              <li key={task._id}>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(String(task._id))}
                    onChange={() => toggleTask(String(task._id))}
                  />
                  <span className="truncate">{task.title}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Includes {activeTasks.length} outstanding portal-visible task(s).
        </p>
      )}

      {portalUrl ? (
        <div className="mt-4 space-y-2">
          <Input value={portalUrl} readOnly className="text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => setShowInvite(true)}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Send Invite
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={
            busy ||
            (mode === "selective" && selected.size === 0) ||
            (mode === "all_outstanding" && activeTasks.length === 0)
          }
          onClick={() => void handleGenerate()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate"}
        </Button>
      </div>

      {showInvite ? (
        <OverlayShell
          open
          onClose={() => setShowInvite(false)}
          aria-label="Send invite"
          panelClassName="w-full max-w-md p-5"
        >
          <h4 className="text-sm font-semibold">Send Invite</h4>
          <div className="mt-3 space-y-2">
            <Input
              placeholder="Client email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              type="email"
            />
            <Input
              placeholder="Client name (optional)"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="min-h-[8rem] w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-xs"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Use {{Client_Name}} and {{Upload_Link}}"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowInvite(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={inviteBusy}
              onClick={() => void handleSendInvite()}
            >
              {inviteBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </OverlayShell>
      ) : null}
    </OverlayShell>
  );
}
