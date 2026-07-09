"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight, FolderInput, Users } from "lucide-react";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { revokeAccessConfirm } from "@/lib/ui/confirmDestructive";
import {
  folderDisplayPath,
  folderPortalPath,
} from "@/lib/library/documentVaultFolders";
import {
  PORTAL_REQUEST_CHECKLISTS,
  getPortalRequestChecklist,
} from "@/lib/portalRequestChecklists";

type ClientPortalInviteBlockProps = {
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  /** quickPanel = collapsible drawer block (default); tab = always expanded in Tab 5 */
  layout?: "quickPanel" | "tab";
};

type PortalPermission = "view" | "view_upload";
type LinkExpiresPreset = "1h" | "24h" | "7d" | "30d";
type GrantExpiresPreset = "never" | "30d" | "90d";

const PERMISSION_OPTIONS: { value: PortalPermission; label: string }[] = [
  { value: "view", label: "View only" },
  { value: "view_upload", label: "View + upload" },
];

const LINK_EXPIRE_OPTIONS: { value: LinkExpiresPreset; label: string }[] = [
  { value: "1h", label: "Link: 1 hour" },
  { value: "24h", label: "Link: 24 hours" },
  { value: "7d", label: "Link: 7 days" },
  { value: "30d", label: "Link: 30 days" },
];

const GRANT_EXPIRE_OPTIONS: { value: GrantExpiresPreset; label: string }[] = [
  { value: "never", label: "Access: until revoked" },
  { value: "30d", label: "Access: 30 days" },
  { value: "90d", label: "Access: 90 days" },
];

function formatGrantExpiry(ts: number | undefined): string {
  if (ts == null) return "Until revoked";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function isGrantPastExpiry(ts: number | undefined): boolean {
  if (ts == null) return false;
  return ts < Date.now();
}

function auditKindLabel(kind: string): string {
  const m: Record<string, string> = {
    broker_invite_sent: "Invite sent",
    broker_grant_revoked: "Access revoked",
    broker_posted_update: "Update posted",
    broker_created_request: "Request created",
    magic_link_exchanged: "Magic link used",
    password_login: "Password sign-in",
    client_logout: "Client signed out",
    portal_file_view: "File opened",
    upload_url_issued: "Upload started",
    upload_committed: "Upload finished",
    client_request_completed: "Request completed",
    broker_archived_portal_upload: "Upload archived",
    broker_restored_portal_upload: "Upload restored",
    broker_promoted_portal_upload: "Upload promoted to vault",
  };
  return m[kind] ?? kind;
}

export function ClientPortalInviteBlock({
  pipelineFileId,
  memberUserKey,
  layout = "quickPanel",
}: ClientPortalInviteBlockProps) {
  const { confirm } = useOperationalConfirm();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [permission, setPermission] =
    useState<PortalPermission>("view_upload");
  const [linkExpires, setLinkExpires] =
    useState<LinkExpiresPreset>("24h");
  const [grantExpires, setGrantExpires] =
    useState<GrantExpiresPreset>("never");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastOrgScope, setLastOrgScope] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const qArgs = useMemo(
    () =>
      memberUserKey
        ? { pipelineFileId, memberUserKey }
        : { pipelineFileId },
    [pipelineFileId, memberUserKey],
  );

  const access = useQuery(api.clientPortalAdmin.listAccessForFile, qArgs);
  const vaultFolders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    memberUserKey ? { pipelineFileId, memberUserKey } : { pipelineFileId },
  );
  const audit = useQuery(api.clientPortalAdmin.listAuditForFile, {
    ...qArgs,
    limit: 80,
  });
  const inviteClient = useMutation(api.clientPortalAdmin.inviteClient);
  const revokeGrant = useMutation(api.clientPortalAdmin.revokeGrant);
  const postUpdate = useMutation(api.clientPortalAdmin.postClientUpdate);
  const createRequest = useMutation(api.clientPortalAdmin.createClientRequest);
  const applyChecklist = useMutation(
    api.clientPortalAdmin.applyRequestChecklist,
  );

  const [expandGrant, setExpandGrant] = useState<Id<"clientPortalGrants"> | null>(
    null,
  );
  const [updateSummary, setUpdateSummary] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqBody, setReqBody] = useState("");
  const [reqTargetFolderId, setReqTargetFolderId] = useState<
    Id<"documentFolders"> | ""
  >("");
  const [checklistId, setChecklistId] = useState("");
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [checklistResult, setChecklistResult] = useState<string | null>(null);

  const folderOptions = useMemo(() => {
    const rows = vaultFolders ?? [];
    return [...rows].sort((a, b) =>
      folderDisplayPath(rows, a._id).localeCompare(
        folderDisplayPath(rows, b._id),
        undefined,
        { sensitivity: "base" },
      ),
    );
  }, [vaultFolders]);

  const folderRows = vaultFolders ?? [];

  if (!memberUserKey) {
    return (
      <p className="w-full min-w-0 px-2 text-[11px] text-muted-foreground">
        Sign in with your workspace account to invite clients to the portal.
      </p>
    );
  }

  const panelBody = (
    <div className={layout === "tab" ? "space-y-4" : "mt-2 space-y-3 border-t border-border/60 pt-2"}>
      {layout === "quickPanel" ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Clients get a separate sign-in (magic link or password) and only see
          files you grant — never the full internal app.
        </p>
      ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
              <span className="text-muted-foreground">Client email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                placeholder="client@email.com"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
              <span className="text-muted-foreground">Label (optional)</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                placeholder="e.g. Smith refinance"
              />
            </label>
            <label className="flex min-w-[9rem] flex-col gap-0.5 text-[11px]">
              <span className="text-muted-foreground">Permission</span>
              <select
                value={permission}
                onChange={(e) =>
                  setPermission(e.target.value as PortalPermission)
                }
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {PERMISSION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px]">
              <span className="text-muted-foreground">Sign-in link</span>
              <select
                value={linkExpires}
                onChange={(e) =>
                  setLinkExpires(e.target.value as LinkExpiresPreset)
                }
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {LINK_EXPIRE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px]">
              <span className="text-muted-foreground">Client access</span>
              <select
                value={grantExpires}
                onChange={(e) =>
                  setGrantExpires(e.target.value as GrantExpiresPreset)
                }
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                {GRANT_EXPIRE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              disabled={busy || !email.trim()}
              onClick={async () => {
                setErr(null);
                setLastLink(null);
                setBusy(true);
                try {
                  const res = await inviteClient({
                    pipelineFileId,
                    clientEmail: email.trim(),
                    label: label.trim() || undefined,
                    sendEmail: true,
                    permission,
                    linkExpires,
                    grantExpires,
                    memberUserKey,
                  });
                  setLastLink(res.signInUrl);
                  setLastOrgScope(res.orgScope);
                  setEmail("");
                  setLabel("");
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Sending…" : "Invite + email link"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !email.trim()}
              onClick={async () => {
                setErr(null);
                setLastLink(null);
                setBusy(true);
                try {
                  const res = await inviteClient({
                    pipelineFileId,
                    clientEmail: email.trim(),
                    label: label.trim() || undefined,
                    sendEmail: false,
                    permission,
                    linkExpires,
                    grantExpires,
                    memberUserKey,
                  });
                  setLastLink(res.signInUrl);
                  setLastOrgScope(res.orgScope);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Copy link only
            </Button>
          </div>
          {err ? (
            <p className="text-[11px] text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          {lastLink ? (
            <div className="rounded-md border border-border bg-background/80 p-2 text-[11px]">
              <div className="mb-1 font-medium text-foreground">Sign-in link</div>
              <div className="break-all font-mono text-muted-foreground">
                {lastLink}
              </div>
              {lastOrgScope ? (
                <p className="mt-2 text-muted-foreground">
                  Password sign-in workspace:{" "}
                  <code className="rounded bg-muted px-1">{lastOrgScope}</code>
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void navigator.clipboard.writeText(lastLink)}
              >
                Copy to clipboard
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-foreground">
              Active client access
            </div>
            {access === undefined ? (
              <p className="text-[11px] text-muted-foreground">Loading…</p>
            ) : access.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No active portal grants yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {access.map((g) => (
                  <li
                    key={g._id}
                    className={cn(
                      "rounded-md border border-border/70 bg-background/60",
                      expandGrant === g._id && "ring-1 ring-primary/30",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-[11px]"
                        onClick={() =>
                          setExpandGrant((x) => (x === g._id ? null : g._id))
                        }
                      >
                        <div className="truncate font-medium text-foreground">
                          {g.emailKey}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {g.permission === "view"
                            ? "View only"
                            : "View + upload"}
                          {isGrantPastExpiry(g.grantExpiresAt) ? (
                            <span className="ml-1 text-amber-700 dark:text-amber-400">
                              (expired — renew invite)
                            </span>
                          ) : (
                            <>
                              {" · "}
                              {formatGrantExpiry(g.grantExpiresAt)}
                            </>
                          )}
                        </div>
                        {g.label ? (
                          <div className="truncate text-muted-foreground">
                            {g.label}
                          </div>
                        ) : null}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={async () => {
                          const ok = await confirm(
                            revokeAccessConfirm(
                              g.label?.trim() || g.emailKey,
                              "Portal access for this email on this file is revoked.",
                            ),
                          );
                          if (!ok) return;
                          try {
                            await revokeGrant({
                              grantId: g._id,
                              memberUserKey,
                            });
                          } catch (e) {
                            alert(
                              e instanceof Error ? e.message : String(e),
                            );
                          }
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                    {expandGrant === g._id ? (
                      <div className="space-y-2 border-t border-border/60 px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Status update (client sees this)
                          </span>
                          <textarea
                            value={updateSummary}
                            onChange={(e) => setUpdateSummary(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder="Short update, e.g. “Submitted to underwriting”"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!updateSummary.trim()}
                            onClick={async () => {
                              try {
                                await postUpdate({
                                  grantId: g._id,
                                  summary: updateSummary.trim(),
                                  memberUserKey,
                                });
                                setUpdateSummary("");
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : String(e),
                                );
                              }
                            }}
                          >
                            Post update
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Request client action
                          </span>
                          <input
                            type="text"
                            value={reqTitle}
                            onChange={(e) => setReqTitle(e.target.value)}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder="Title"
                          />
                          <textarea
                            value={reqBody}
                            onChange={(e) => setReqBody(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                            placeholder="Instructions (optional)"
                          />
                          <label className="flex flex-col gap-0.5 text-[10px]">
                            <span className="flex items-center gap-1 uppercase tracking-wide text-muted-foreground">
                              <FolderInput className="h-3 w-3" aria-hidden />
                              Destination folder
                            </span>
                            <select
                              value={reqTargetFolderId}
                              onChange={(e) =>
                                setReqTargetFolderId(
                                  e.target.value
                                    ? (e.target.value as Id<"documentFolders">)
                                    : "",
                                )
                              }
                              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                              data-testid="portal-request-target-folder"
                            >
                              <option value="">Root (no subfolder)</option>
                              {folderOptions.map((folder) => (
                                <option key={folder._id} value={folder._id}>
                                  {folderPortalPath(folderRows, folder._id)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!reqTitle.trim()}
                            onClick={async () => {
                              try {
                                await createRequest({
                                  grantId: g._id,
                                  title: reqTitle.trim(),
                                  description: reqBody.trim() || undefined,
                                  targetFolderId: reqTargetFolderId || undefined,
                                  memberUserKey,
                                });
                                setReqTitle("");
                                setReqBody("");
                                setReqTargetFolderId("");
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : String(e),
                                );
                              }
                            }}
                          >
                            Create request
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Apply request checklist
                          </span>
                          <select
                            value={checklistId}
                            onChange={(e) => {
                              setChecklistId(e.target.value);
                              setChecklistResult(null);
                            }}
                            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                            data-testid="portal-request-checklist-select"
                          >
                            <option value="">Choose a checklist…</option>
                            {PORTAL_REQUEST_CHECKLISTS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.items.length} items)
                              </option>
                            ))}
                          </select>
                          {checklistId ? (
                            <p className="text-[10px] text-muted-foreground">
                              {getPortalRequestChecklist(checklistId)
                                ?.description ?? ""}
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!checklistId || checklistBusy}
                            data-testid="portal-request-checklist-apply"
                            onClick={async () => {
                              const checklist =
                                getPortalRequestChecklist(checklistId);
                              if (!checklist) return;
                              setChecklistBusy(true);
                              setChecklistResult(null);
                              try {
                                const res = await applyChecklist({
                                  grantId: g._id,
                                  checklistName: checklist.name,
                                  items: checklist.items,
                                  memberUserKey,
                                });
                                setChecklistResult(
                                  `${res.createdCount} request${res.createdCount === 1 ? "" : "s"} created` +
                                    (res.skippedCount > 0
                                      ? `, ${res.skippedCount} already open`
                                      : ""),
                                );
                              } catch (e) {
                                setChecklistResult(
                                  e instanceof Error ? e.message : String(e),
                                );
                              } finally {
                                setChecklistBusy(false);
                              }
                            }}
                          >
                            {checklistBusy ? "Applying…" : "Apply checklist"}
                          </Button>
                          {checklistResult ? (
                            <p className="text-[10px] text-muted-foreground">
                              {checklistResult}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="text-[11px] font-medium text-foreground">
              Portal activity (audit)
            </div>
            {audit === undefined ? (
              <p className="text-[11px] text-muted-foreground">Loading…</p>
            ) : audit.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No audit events yet.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background/40 p-1.5 text-[10px]">
                {audit.map((a) => (
                  <li
                    key={a._id}
                    className="rounded px-1 py-0.5 text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {auditKindLabel(a.kind)}
                    </span>
                    <span className="mx-1">·</span>
                    {new Date(a.at).toLocaleString()}
                    {a.detail ? (
                      <span className="block truncate text-[10px] opacity-90">
                        {a.detail}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
  );

  if (layout === "tab") {
    return (
      <div
        className="dlc-surface-card rounded-dlc-md border border-border/80 px-3 py-4 sm:px-4"
        data-testid="pipeline-portal-invite-block-tab"
      >
        {panelBody}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        Client portal
      </button>
      {open ? panelBody : null}
    </div>
  );
}
