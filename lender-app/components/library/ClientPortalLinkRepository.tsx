"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  Clock,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldOff,
  Upload,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type ClientPortalLinkRepositoryProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  onError: (message: string) => void;
};

type TabId = "client" | "lender" | "access";
type ExtendDays = "7" | "14" | "30";
type PortalLinkRow = {
  _id: Id<"clientPortalLinks">;
  linkType: "client" | "lender" | "task_upload" | "portal_grant";
  targetName?: string;
  title?: string;
  emailKey?: string;
  companySlug?: string;
  legacyPath?: boolean;
  requiresVerification?: boolean;
  verificationType?: "passcode" | "email_otp";
  status: string;
  expiresAt: number;
  linkKind?: string;
};

function statusTone(status: string): string {
  if (status === "active") return "text-emerald-700 bg-emerald-50";
  if (status === "revoked") return "text-red-700 bg-red-50";
  return "text-amber-800 bg-amber-50";
}

function formatExpiry(ms: number): string {
  const delta = ms - Date.now();
  if (delta <= 0) return "Expired";
  const hours = Math.floor(delta / (60 * 60 * 1000));
  if (hours < 48) return `${hours}h remaining`;
  const days = Math.floor(hours / 24);
  return `${days}d remaining`;
}

function targetLabel(link: PortalLinkRow): string {
  if (link.linkType === "task_upload") {
    return link.title ?? "Task upload link";
  }
  if (link.linkType === "portal_grant") {
    return link.title ?? `Portal grant: ${link.emailKey ?? "Client"}`;
  }
  if (link.linkType === "lender") {
    return link.targetName
      ? `Lender: ${link.targetName}`
      : link.title ?? "Lender delivery";
  }
  return link.targetName
    ? `Client: ${link.targetName}`
    : link.title ?? "Client portal link";
}

function pathHint(link: PortalLinkRow): string {
  if (link.linkType === "task_upload") return "/upload/…";
  if (link.linkType === "portal_grant") return "/portal/magic?t=…";
  if (link.legacyPath) return "/lender-delivery/…";
  if (link.companySlug) return `/${link.companySlug}/…`;
  if (link.linkType === "lender") return "/lender-delivery/…";
  return "/client-portal/…";
}

export function ClientPortalLinkRepository({
  open,
  onClose,
  pipelineFileId,
  memberUserKey,
  onError,
}: ClientPortalLinkRepositoryProps) {
  const [tab, setTab] = useState<TabId>("client");
  const [busyLinkId, setBusyLinkId] = useState<Id<"clientPortalLinks"> | null>(
    null,
  );
  const [regeneratedUrl, setRegeneratedUrl] = useState<string | null>(null);
  const [securityLinkId, setSecurityLinkId] = useState<Id<"clientPortalLinks"> | null>(
    null,
  );
  const [securityPasscode, setSecurityPasscode] = useState("");

  const clientLinks = useQuery(
    api.clientPortalLinks.listLinksForPipeline,
    open && memberUserKey
      ? { pipelineFileId, memberUserKey, linkType: "client" }
      : "skip",
  );
  const lenderLinks = useQuery(
    api.clientPortalLinks.listLinksForPipeline,
    open && memberUserKey
      ? { pipelineFileId, memberUserKey, linkType: "lender" }
      : "skip",
  );
  const accessLinks = useQuery(
    api.clientPortalLinks.listLinksForPipeline,
    open && memberUserKey
      ? { pipelineFileId, memberUserKey, linkType: "access" }
      : "skip",
  );
  const revokeLink = useMutation(api.clientPortalLinks.revokeLink);
  const extendLinkExpiry = useMutation(api.clientPortalLinks.extendLinkExpiry);
  const reactivateLink = useMutation(api.clientPortalLinks.reactivateLink);
  const regenerateLinkToken = useMutation(
    api.clientPortalLinks.regenerateLinkToken,
  );
  const setLinkVerification = useMutation(api.clientPortalLinks.setLinkVerification);

  const activeLinks =
    tab === "client" ? clientLinks : tab === "lender" ? lenderLinks : accessLinks;
  const securityLink = activeLinks?.find((l) => l._id === securityLinkId);

  const counts = useMemo(
    () => ({
      client: clientLinks?.filter((l) => l.status === "active").length ?? 0,
      lender: lenderLinks?.filter((l) => l.status === "active").length ?? 0,
      access: accessLinks?.filter((l) => l.status === "active").length ?? 0,
    }),
    [accessLinks, clientLinks, lenderLinks],
  );

  async function runAction(
    linkId: Id<"clientPortalLinks">,
    action: () => Promise<void>,
  ) {
    setBusyLinkId(linkId);
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyLinkId(null);
    }
  }

  if (!open) return null;

  return (
    <OverlayShell
      open
      onClose={onClose}
      aria-label="Link repository"
      panelClassName="w-full max-w-2xl p-5"
    >
      <div data-testid="portal-link-repository">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Link2 className="h-4 w-4" aria-hidden />
          Link repository
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Central control for client, lender, task-upload, and portal-grant access.
          Extend, reactivate, regenerate, revoke, or configure security gates.
        </p>

        <div
          className="mt-4 flex gap-1 rounded-dlc-md border border-border/70 p-0.5"
          role="tablist"
          aria-label="Link audience"
        >
          {(
            [
              { id: "client" as const, label: "Client Links", icon: Users },
              { id: "lender" as const, label: "Lender Links", icon: Building2 },
              { id: "access" as const, label: "Access Controls", icon: Upload },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-dlc-sm px-2 py-1.5 text-xs font-medium",
                tab === id
                  ? "bg-dlc-surface-high shadow-dlc-1 text-foreground"
                  : "text-muted-foreground",
              )}
              data-testid={`portal-link-tab-${id}`}
              onClick={() => setTab(id)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
              <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px]">
                {counts[id]}
              </span>
            </button>
          ))}
        </div>

        {activeLinks === undefined ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading links…
          </div>
        ) : activeLinks.length === 0 ? (
          <p className="mt-6 text-xs text-muted-foreground">
            No{" "}
            {tab === "client"
              ? "client portal"
              : tab === "lender"
                ? "lender delivery"
                : "task-upload or portal-grant"}{" "}
            links issued for this file yet.
          </p>
        ) : (
          <ul className="mt-4 max-h-[min(60dvh,420px)] space-y-2 overflow-y-auto">
            {activeLinks.map((link) => {
              const busy = busyLinkId === link._id;
              const canExtend =
                memberUserKey &&
                (link.status === "active" || link.status === "expired");
              const canReactivate =
                memberUserKey &&
                (link.status === "revoked" || link.status === "expired");
              const canRevoke = memberUserKey && link.status === "active";
              const canRegenerate =
                Boolean(memberUserKey) && link.linkType !== "portal_grant";
              const canSecure =
                Boolean(memberUserKey) &&
                link.linkType !== "portal_grant" &&
                link.status === "active";

              return (
                <li
                  key={link._id}
                  className="rounded-dlc-md border border-border/70 bg-dlc-surface px-3 py-2.5"
                  data-testid={`portal-link-row-${link._id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {targetLabel(link)}
                        {link.legacyPath ? (
                          <span
                            className="ml-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            data-testid={`portal-link-legacy-${link._id}`}
                          >
                            Legacy
                          </span>
                        ) : null}
                        {link.requiresVerification ? (
                          <span className="ml-1.5 inline-flex rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">
                            Secured
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {pathHint(link)}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {(link.linkKind ?? link.linkType).replace(/_/g, " ")} ·{" "}
                        {formatExpiry(link.expiresAt)} · expires{" "}
                        {new Date(link.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        statusTone(link.status),
                      )}
                      data-testid={`portal-link-status-${link._id}`}
                    >
                      {link.status}
                    </span>
                  </div>

                  {memberUserKey ? (
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                      {canSecure ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          disabled={busy}
                          data-testid={`portal-link-security-${link._id}`}
                          onClick={() => {
                            setSecurityLinkId(link._id);
                            setSecurityPasscode("");
                          }}
                        >
                          <KeyRound className="h-3 w-3" aria-hidden />
                          Security
                        </Button>
                      ) : null}

                      {canExtend ? (
                        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden />
                          <span className="sr-only">Extend expiry</span>
                          <select
                            className="h-7 rounded-dlc-sm border border-border/70 bg-background px-1.5 text-[10px]"
                            disabled={busy}
                            defaultValue=""
                            data-testid={`portal-link-extend-${link._id}`}
                            onChange={(e) => {
                              const days = e.target.value as ExtendDays | "";
                              if (!days) return;
                              e.target.value = "";
                              void runAction(link._id, async () => {
                                const result = await extendLinkExpiry({
                                  linkId: link._id,
                                  extendDays: days,
                                  memberUserKey,
                                });
                                showOperationalToast({
                                  title: "Expiry extended",
                                  description: `New expiry: ${new Date(result.expiresAt).toLocaleString()}`,
                                  variant: "success",
                                });
                              });
                            }}
                          >
                            <option value="">Extend…</option>
                            <option value="7">+7 days</option>
                            <option value="14">+14 days</option>
                            <option value="30">+30 days</option>
                          </select>
                        </label>
                      ) : null}

                      {canReactivate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          disabled={busy}
                          data-testid={`portal-link-reactivate-${link._id}`}
                          onClick={() =>
                            void runAction(link._id, async () => {
                              const result = await reactivateLink({
                                linkId: link._id,
                                extendDays: "14",
                                memberUserKey,
                              });
                              showOperationalToast({
                                title: "Link reactivated",
                                description: `Access restored until ${new Date(result.expiresAt).toLocaleString()}`,
                                variant: "success",
                              });
                            })
                          }
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                          Reactivate
                        </Button>
                      ) : null}

                      {canRegenerate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          disabled={busy}
                          data-testid={`portal-link-regenerate-${link._id}`}
                          onClick={() =>
                            void runAction(link._id, async () => {
                              const result = await regenerateLinkToken({
                                linkId: link._id,
                                extendDays: "14",
                                memberUserKey,
                              });
                              setRegeneratedUrl(result.portalUrl);
                              showOperationalToast({
                                title: "New secure URL issued",
                                description:
                                  "The previous URL is invalid. Copy the new link below.",
                                variant: "success",
                              });
                            })
                          }
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden />
                          Regenerate
                        </Button>
                      ) : null}

                      {canRevoke ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px] text-red-700 hover:text-red-800"
                          disabled={busy}
                          data-testid={`portal-link-kill-${link._id}`}
                          onClick={() =>
                            void runAction(link._id, async () => {
                              await revokeLink({
                                linkId: link._id,
                                memberUserKey,
                              });
                              showOperationalToast({
                                title: "Link revoked",
                                description: "This session is no longer valid.",
                              });
                            })
                          }
                        >
                          <ShieldOff className="h-3 w-3" aria-hidden />
                          Kill link
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {regeneratedUrl ? (
          <div
            className="mt-4 rounded-dlc-md border border-emerald-200/80 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/30"
            data-testid="portal-link-regenerated-url"
          >
            <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-100">
              New secure URL (shown once)
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-foreground">
              {regeneratedUrl}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 gap-1 text-[11px]"
              onClick={() => {
                void navigator.clipboard.writeText(regeneratedUrl);
                showOperationalToast({
                  title: "Copied",
                  variant: "success",
                });
              }}
            >
              <Copy className="h-3 w-3" aria-hidden />
              Copy URL
            </Button>
          </div>
        ) : null}

        {securityLink ? (
          <div
            className="mt-4 rounded-dlc-md border border-border/70 bg-dlc-surface px-3 py-3"
            data-testid="portal-link-security-panel"
          >
            <p className="text-xs font-semibold text-foreground">
              Security settings — {targetLabel(securityLink)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Optional passcode or email OTP gate before the portal loads.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() =>
                  void runAction(securityLink._id, async () => {
                    await setLinkVerification({
                      linkId: securityLink._id,
                      enabled: false,
                      memberUserKey,
                    });
                    setSecurityLinkId(null);
                    showOperationalToast({ title: "Security disabled" });
                  })
                }
              >
                Disable
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() =>
                  void runAction(securityLink._id, async () => {
                    await setLinkVerification({
                      linkId: securityLink._id,
                      enabled: true,
                      verificationType: "email_otp",
                      verificationEmail: securityLink.emailKey,
                      memberUserKey,
                    });
                    showOperationalToast({
                      title: "Email OTP enabled",
                      variant: "success",
                    });
                  })
                }
              >
                Email OTP
              </Button>
            </div>
            <label className="mt-3 block text-[10px] font-medium text-foreground">
              Passcode (min 4 chars)
              <Input
                className="mt-1 h-8"
                type="password"
                value={securityPasscode}
                onChange={(e) => setSecurityPasscode(e.target.value)}
                data-testid="portal-link-security-passcode"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="primary"
              className="mt-2 h-7 text-[11px]"
              disabled={securityPasscode.trim().length < 4}
              onClick={() =>
                void runAction(securityLink._id, async () => {
                  await setLinkVerification({
                    linkId: securityLink._id,
                    enabled: true,
                    verificationType: "passcode",
                    passcode: securityPasscode,
                    memberUserKey,
                  });
                  setSecurityLinkId(null);
                  setSecurityPasscode("");
                  showOperationalToast({
                    title: "Passcode protection enabled",
                    variant: "success",
                  });
                })
              }
            >
              Enable passcode
            </Button>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
