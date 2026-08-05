"use client";

import { useEffect, useMemo, useState } from "react";
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
import { clientPortalPublicOrigin } from "@/lib/clientPortalUrl";
import { showOperationalToast } from "@/lib/ui/operationalToast";

export type ClientPortalLinkRepositoryProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  onError: (message: string) => void;
};

type TabId = "client" | "lender" | "access";
type AdjustDays = "7" | "14" | "30" | "-7" | "-14" | "-30";
type PortalLinkRow = {
  _id: Id<"clientPortalLinks">;
  linkType: "client" | "lender" | "task_upload" | "portal_grant";
  targetName?: string;
  title?: string;
  emailKey?: string;
  companySlug?: string;
  legacyPath?: boolean;
  issuedUrl?: string;
  requiresVerification?: boolean;
  verificationType?: "passcode" | "email_otp";
  verificationEmail?: string;
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

const DAY_MS = 24 * 60 * 60 * 1000;

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeAdjustedExpiry(currentExpiresAt: number, adjustDays: AdjustDays): number {
  const now = Date.now();
  const deltaMs = Number(adjustDays) * DAY_MS;
  if (deltaMs >= 0) {
    return Math.max(currentExpiresAt, now) + deltaMs;
  }
  return currentExpiresAt + deltaMs;
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

/** Full absolute URL when known; otherwise a readable prefix for regenerate. */
function displayUrl(link: PortalLinkRow): {
  url: string | null;
  hint: string;
} {
  const issued = link.issuedUrl?.trim();
  if (issued) return { url: issued, hint: issued };

  const origin = clientPortalPublicOrigin();
  if (link.linkType === "task_upload") {
    return { url: null, hint: `${origin}/upload/…` };
  }
  if (link.linkType === "portal_grant") {
    return { url: null, hint: `${origin}/portal/magic?t=…` };
  }
  if (link.legacyPath) {
    return { url: null, hint: `${origin}/lender-delivery/…` };
  }
  if (link.companySlug) {
    return { url: null, hint: `${origin}/${link.companySlug}/…` };
  }
  if (link.linkType === "lender") {
    return { url: null, hint: `${origin}/lender-delivery/…` };
  }
  return { url: null, hint: `${origin}/client-portal/…` };
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
  const [securityEmail, setSecurityEmail] = useState("");
  const [expiryEditLinkId, setExpiryEditLinkId] = useState<Id<"clientPortalLinks"> | null>(
    null,
  );
  const [expiryEditValue, setExpiryEditValue] = useState("");

  // One-time URL banner + expiry editor are session-scoped to the open modal.
  useEffect(() => {
    if (!open) {
      setRegeneratedUrl(null);
      setExpiryEditLinkId(null);
      setExpiryEditValue("");
    }
  }, [open]);

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
  const setLinkExpiry = useMutation(api.clientPortalLinks.setLinkExpiry);
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
      panelClassName="flex max-h-[min(90dvh,720px)] w-full max-w-2xl flex-col overflow-hidden p-5"
    >
      <div data-testid="portal-link-repository" className="flex min-h-0 flex-1 flex-col">
        <h3 className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Link2 className="h-4 w-4" aria-hidden />
          Link repository
        </h3>
        <p className="mt-1 shrink-0 text-xs text-muted-foreground">
          Central control for client, lender, task-upload, and portal-grant access.
          Extend, reactivate, regenerate, revoke, or configure security gates.
        </p>

        <div
          className="mt-4 flex shrink-0 gap-1 rounded-dlc-md border border-border/70 p-0.5"
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
              onClick={() => {
                setTab(id);
                setSecurityLinkId(null);
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
              <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px]">
                {counts[id]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {activeLinks === undefined ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading links…
            </div>
          ) : activeLinks.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              No{" "}
              {tab === "client"
                ? "client portal"
                : tab === "lender"
                  ? "lender delivery"
                  : "task-upload or portal-grant"}{" "}
              links issued for this file yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeLinks.map((link) => {
                const busy = busyLinkId === link._id;
                const canEditExpiry =
                  Boolean(memberUserKey) &&
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
                const { url, hint } = displayUrl(link);
                const editingExpiry = expiryEditLinkId === link._id;

                return (
                  <li
                    key={link._id}
                    className="rounded-dlc-md border border-border/70 bg-dlc-surface px-3 py-2.5"
                    data-testid={`portal-link-row-${link._id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
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
                              {link.verificationType
                                ? ` · ${link.verificationType === "email_otp" ? "OTP" : "passcode"}`
                                : ""}
                            </span>
                          ) : null}
                        </p>
                        <p
                          className="mt-1 break-all font-mono text-[10px] leading-relaxed text-foreground"
                          data-testid={`portal-link-url-${link._id}`}
                        >
                          {hint}
                        </p>
                        {!url ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Full token URL is unavailable for older links — Regenerate to
                            issue a new copyable URL.
                          </p>
                        ) : null}
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
                        {url ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-[11px]"
                            disabled={busy}
                            data-testid={`portal-link-copy-${link._id}`}
                            onClick={() => {
                              void navigator.clipboard.writeText(url).then(
                                () =>
                                  showOperationalToast({
                                    title: "Link copied",
                                    variant: "success",
                                  }),
                                () => onError("Could not copy link."),
                              );
                            }}
                          >
                            <Copy className="h-3 w-3" aria-hidden />
                            Copy URL
                          </Button>
                        ) : null}

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
                              setSecurityEmail(
                                link.verificationEmail ?? link.emailKey ?? "",
                              );
                            }}
                          >
                            <KeyRound className="h-3 w-3" aria-hidden />
                            Security
                          </Button>
                        ) : null}

                        {canEditExpiry ? (
                          <>
                            <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" aria-hidden />
                              <span className="sr-only">Adjust expiry</span>
                              <select
                                className="h-7 rounded-dlc-sm border border-border/70 bg-background px-1.5 text-[10px]"
                                disabled={busy}
                                value=""
                                data-testid={`portal-link-adjust-expiry-${link._id}`}
                                onChange={(e) => {
                                  const days = e.target.value as AdjustDays | "";
                                  if (!days || !memberUserKey) return;
                                  const next = computeAdjustedExpiry(
                                    link.expiresAt,
                                    days,
                                  );
                                  if (next <= Date.now()) {
                                    onError(
                                      "That adjustment would expire the link immediately. Use Set expiry for a specific date.",
                                    );
                                    return;
                                  }
                                  void runAction(link._id, async () => {
                                    const result = await setLinkExpiry({
                                      linkId: link._id,
                                      expiresAt: next,
                                      memberUserKey,
                                    });
                                    showOperationalToast({
                                      title: "Expiry updated",
                                      description: `New expiry: ${new Date(result.expiresAt).toLocaleString()}`,
                                      variant: "success",
                                    });
                                  });
                                }}
                              >
                                <option value="">Adjust…</option>
                                <option value="7">+7 days</option>
                                <option value="14">+14 days</option>
                                <option value="30">+30 days</option>
                                <option value="-7">−7 days</option>
                                <option value="-14">−14 days</option>
                                <option value="-30">−30 days</option>
                              </select>
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-[11px]"
                              disabled={busy}
                              data-testid={`portal-link-set-expiry-${link._id}`}
                              onClick={() => {
                                setExpiryEditLinkId(link._id);
                                setExpiryEditValue(
                                  toDatetimeLocalValue(
                                    Math.max(link.expiresAt, Date.now() + 60_000),
                                  ),
                                );
                              }}
                            >
                              <Clock className="h-3 w-3" aria-hidden />
                              Set expiry
                            </Button>
                          </>
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

                    {editingExpiry && memberUserKey ? (
                      <div
                        className="mt-2 rounded-dlc-sm border border-border/70 bg-dlc-surface-high px-2.5 py-2"
                        data-testid={`portal-link-expiry-editor-${link._id}`}
                      >
                        <label className="block text-[10px] font-medium text-foreground">
                          Link expires
                          <Input
                            className="mt-1 h-8"
                            type="datetime-local"
                            value={expiryEditValue}
                            onChange={(e) => setExpiryEditValue(e.target.value)}
                            data-testid={`portal-link-expiry-input-${link._id}`}
                          />
                        </label>
                        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            disabled={busy}
                            onClick={() => {
                              setExpiryEditLinkId(null);
                              setExpiryEditValue("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            className="h-7 text-[11px]"
                            disabled={busy || !expiryEditValue}
                            data-testid={`portal-link-expiry-save-${link._id}`}
                            onClick={() => {
                              const next = fromDatetimeLocalValue(expiryEditValue);
                              if (next == null) {
                                onError("Enter a valid expiry date and time.");
                                return;
                              }
                              if (next <= Date.now()) {
                                onError("Expiry must be in the future.");
                                return;
                              }
                              void runAction(link._id, async () => {
                                const result = await setLinkExpiry({
                                  linkId: link._id,
                                  expiresAt: next,
                                  memberUserKey,
                                });
                                setExpiryEditLinkId(null);
                                setExpiryEditValue("");
                                showOperationalToast({
                                  title: "Expiry updated",
                                  description: `New expiry: ${new Date(result.expiresAt).toLocaleString()}`,
                                  variant: "success",
                                });
                              });
                            }}
                          >
                            Save expiry
                          </Button>
                        </div>
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
                New secure URL (shown once — also saved on the link row)
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
                Optional passcode or email OTP gate before the portal loads. Visitors are
                redirected to verify access first.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={busyLinkId === securityLink._id}
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
              </div>
              <label className="mt-3 block text-[10px] font-medium text-foreground">
                Verification email (for Email OTP)
                <Input
                  className="mt-1 h-8"
                  type="email"
                  value={securityEmail}
                  onChange={(e) => setSecurityEmail(e.target.value)}
                  placeholder="client@example.com"
                  data-testid="portal-link-security-email"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-[11px]"
                disabled={
                  busyLinkId === securityLink._id ||
                  !securityEmail.trim().includes("@")
                }
                onClick={() =>
                  void runAction(securityLink._id, async () => {
                    await setLinkVerification({
                      linkId: securityLink._id,
                      enabled: true,
                      verificationType: "email_otp",
                      verificationEmail: securityEmail.trim(),
                      memberUserKey,
                    });
                    showOperationalToast({
                      title: "Email OTP enabled",
                      variant: "success",
                    });
                  })
                }
              >
                Enable Email OTP
              </Button>
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
                disabled={
                  busyLinkId === securityLink._id ||
                  securityPasscode.trim().length < 4
                }
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
        </div>

        <div className="mt-5 flex shrink-0 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
