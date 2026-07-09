"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Mail } from "lucide-react";

function csvToList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function OrgEmailFromFilePanel({
  organizationId,
  pipelineFileId,
  memberUserKey,
  sectionOpen,
  onSectionOpenChange,
}: {
  organizationId: Id<"organizations">;
  pipelineFileId: Id<"pipeline">;
  memberUserKey: string;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}) {
  const sectionControlled =
    sectionOpen !== undefined && onSectionOpenChange !== undefined;
  const can = useQuery(api.systemEmails.canSendSystemEmail, {
    organizationId,
    memberUserKey,
  });
  const recent = useQuery(
    api.systemEmails.listRecentForOrganization,
    can?.ok
      ? {
          organizationId,
          memberUserKey,
          limit: 12,
          relatedPipelineFileId: pipelineFileId,
        }
      : "skip",
  );
  const sendEmail = useMutation(api.systemEmails.sendOrganizationEmail);
  const markReply = useMutation(api.systemEmails.markReplyObserved);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [trackOpens, setTrackOpens] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandId, setExpandId] = useState<Id<"systemEmailLog"> | null>(null);

  const events = useQuery(
    api.systemEmails.listEventsForEmail,
    expandId && can?.ok
      ? { organizationId, memberUserKey, emailLogId: expandId }
      : "skip",
  );

  const submit = useCallback(async () => {
    if (!can?.ok) return;
    setBusy(true);
    setErr(null);
    try {
      await sendEmail({
        organizationId,
        memberUserKey,
        to: csvToList(to),
        cc: cc.trim() ? csvToList(cc) : undefined,
        subject,
        bodyText: body,
        trackOpens,
        relatedPipelineFileId: pipelineFileId,
      });
      setTo("");
      setCc("");
      setSubject("");
      setBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }, [
    can?.ok,
    sendEmail,
    organizationId,
    memberUserKey,
    to,
    cc,
    subject,
    body,
    trackOpens,
    pipelineFileId,
  ]);

  const permissionHint = useMemo(() => {
    if (can === undefined) return null;
    if (!can.ok) {
      return "Your role does not include sending system email. Ask an admin to grant the “email.send” permission.";
    }
    return null;
  }, [can]);

  return (
    <CollapsibleSection
      variant="card"
      animated
      lazyMount
      {...(sectionControlled
        ? { open: sectionOpen, onOpenChange: onSectionOpenChange }
        : { defaultOpen: false })}
      title={
        <span className="flex items-center gap-2 normal-case">
          <Mail className="h-3.5 w-3.5" aria-hidden />
          Email from workspace
        </span>
      }
      description="Sends via Resend using SYSTEM_EMAIL_FROM / RESEND_API_KEY. Optionally track opens (requires EMAIL_PUBLIC_BASE_URL to your Convex HTTP origin). Correlation id is in headers for inbound webhook matching."
    >
      {permissionHint ? (
        <p className="text-xs text-muted-foreground">{permissionHint}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] text-muted-foreground">To</label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email@example.com (comma-separated)"
                className="text-xs"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] text-muted-foreground">Cc (optional)</label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Optional"
                className="text-xs"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] text-muted-foreground">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] text-muted-foreground">Message</label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={50000}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={trackOpens}
                onChange={(e) => setTrackOpens(e.target.checked)}
              />
              Track opens (privacy notice: recipients load a 1×1 pixel)
            </label>
          </div>
          {err ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : "Send email"}
          </Button>

          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Recent for this file
            </p>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
              {(recent ?? []).map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    className="w-full rounded border border-border/60 bg-muted/10 px-2 py-1.5 text-left hover:bg-muted/20"
                    onClick={() =>
                      setExpandId((v) => (v === row._id ? null : row._id))
                    }
                  >
                    <span className="font-medium">{row.subject}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {row.status} · opens: {row.openCount}
                      {row.hasInboundReply ? " · reply" : ""}
                    </span>
                  </button>
                  {expandId === row._id && events ? (
                    <ul className="mt-1 space-y-1 pl-2 text-[10px] text-muted-foreground">
                      <li className="font-mono text-[10px]">
                        correlation: {row.correlationId}
                      </li>
                      {events.map((ev) => (
                        <li key={ev._id}>
                          {ev.kind} @ {new Date(ev.at).toLocaleString()}
                          {ev.detail ? ` — ${ev.detail}` : ""}
                        </li>
                      ))}
                      <li className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void (async () => {
                              const sn = window.prompt(
                                "Optional: paste a short reply summary for the log:",
                              );
                              try {
                                await markReply({
                                  organizationId,
                                  memberUserKey,
                                  emailLogId: row._id,
                                  snippet: sn?.trim() || undefined,
                                });
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : String(e),
                                );
                              }
                            })()
                          }
                        >
                          Log reply observed
                        </Button>
                      </li>
                    </ul>
                  ) : null}
                </li>
              ))}
              {recent && recent.length === 0 ? (
                <li className="text-muted-foreground">No sent mail yet.</li>
              ) : null}
            </ul>
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}
