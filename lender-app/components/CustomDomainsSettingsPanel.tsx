"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/sessionUiClient";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { unlinkConfirm } from "@/lib/ui/confirmDestructive";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useActorUserKey } from "@/lib/useActorUserKey";

const CNAME_HINT =
  "Point the hostname to your Vercel (or other) deployment target; TLS certificates are issued automatically once DNS resolves. Typical Vercel target: cname.vercel-dns.com";

export function CustomDomainsSettingsPanel() {
  const { confirm } = useOperationalConfirm();
  const { isLoaded, isSignedIn } = useAuth();
  const orgScope = useOrgConvexQueryArgs();
  const { can } = useOrgPermissions();
  const actorKey = useActorUserKey();

  const convexOrg = useQuery(
    api.organizations.get,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );

  const domains = useQuery(
    api.organizationCustomDomains.listForOrganization,
    orgScope && can("settings.access")
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );

  const requestDomain = useMutation(
    api.organizationCustomDomains.requestCustomDomain,
  );
  const scheduleVerify = useMutation(
    api.organizationCustomDomains.scheduleTxtVerification,
  );
  const disableDomain = useMutation(
    api.organizationCustomDomains.disableCustomDomain,
  );
  const registerVercel = useAction(
    api.organizationCustomDomains.registerWithVercelProject,
  );

  const [hostnameDraft, setHostnameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastInstr, setLastInstr] = useState<{
    txtName: string;
    txtValue: string;
  } | null>(null);

  const canManage = can("settings.access") && orgScope && convexOrg;

  const submitRequest = useCallback(async () => {
    if (!orgScope || !hostnameDraft.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await requestDomain({
        organizationId: orgScope.organizationId,
        hostname: hostnameDraft.trim(),
        actorUserKey: orgScope.memberUserKey,
      });
      setLastInstr({ txtName: r.txtName, txtValue: r.txtValue });
      setHostnameDraft("");
      setMsg(
        "Domain added as pending. Publish the TXT record, wait for DNS, then run “Check DNS”.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [orgScope, hostnameDraft, requestDomain]);

  const checkDns = useCallback(
    async (domainId: Id<"organizationCustomDomains">) => {
      if (!orgScope) return;
      setBusy(true);
      setMsg(null);
      try {
        await scheduleVerify({
          domainId,
          actorUserKey: orgScope.memberUserKey,
        });
        setMsg(
          "Verification started. Refresh in a few seconds if status is still pending.",
        );
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Verification failed.");
      } finally {
        setBusy(false);
      }
    },
    [orgScope, scheduleVerify],
  );

  const remove = useCallback(
    async (domainId: Id<"organizationCustomDomains">) => {
      if (!orgScope) return;
      const row = domains?.find((d) => d._id === domainId);
      const ok = await confirm(
        unlinkConfirm(
          row?.hostname ?? "this domain",
          "This custom domain mapping is disabled for your organization.",
        ),
      );
      if (!ok) return;
      setBusy(true);
      setMsg(null);
      try {
        await disableDomain({
          domainId,
          actorUserKey: orgScope.memberUserKey,
        });
        setMsg("Domain disabled.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not disable.");
      } finally {
        setBusy(false);
      }
    },
    [orgScope, disableDomain, domains, confirm],
  );

  const vercelRegister = useCallback(
    async (domainId: Id<"organizationCustomDomains">) => {
      const key = actorKey.trim();
      if (!key) return;
      setBusy(true);
      setMsg(null);
      try {
        const r = await registerVercel({ domainId, actorUserKey: key });
        if (r.ok && "skipped" in r && r.skipped) {
          setMsg(r.detail);
        } else if (r.ok && "configured" in r) {
          setMsg("Sent to Vercel API. SSL will follow in the dashboard.");
        } else if (!r.ok) {
          setMsg(r.detail);
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Vercel request failed.");
      } finally {
        setBusy(false);
      }
    },
    [actorKey, registerVercel],
  );

  const rows = useMemo(() => domains ?? [], [domains]);

  if (!isLoaded) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading account…
      </p>
    );
  }

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to manage custom domains for your workspace.
      </p>
    );
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        You need organization settings access to connect domains.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Connect a domain
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{CNAME_HINT}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Add your deployment hostname to your hosting provider so TLS and routing
          match this workspace.
        </p>
      </div>

      <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-muted-foreground">
            Hostname
          </label>
          <Input
            className="mt-0.5 font-mono text-sm"
            placeholder="app.client.com"
            value={hostnameDraft}
            onChange={(e) => setHostnameDraft(e.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={busy || !hostnameDraft.trim()}
          onClick={() => void submitRequest()}
        >
          Add domain
        </Button>
      </div>

      {lastInstr ? (
        <div className="max-w-2xl rounded-md border border-border bg-muted/20 p-3 text-xs">
          <p className="font-medium text-foreground">TXT verification</p>
          <p className="mt-1 text-muted-foreground">
            Add a TXT record (propagation may take a few minutes):
          </p>
          <dl className="mt-2 space-y-1 font-mono text-[11px] text-foreground">
            <div>
              <dt className="text-muted-foreground">Name / host</dt>
              <dd className="break-all">{lastInstr.txtName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="break-all">{lastInstr.txtValue}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your domains
        </h4>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No domains yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((d: Doc<"organizationCustomDomains">) => (
              <li
                key={d._id}
                className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-sm font-medium text-foreground">
                    {d.hostname}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {d.status}
                    {d.verifiedAt
                      ? ` · verified ${new Date(d.verifiedAt).toLocaleString()}`
                      : ""}
                  </p>
                  {d.status === "pending" ? (
                    <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                      TXT record: {`_lender-verify.${d.hostname}`} →{" "}
                      {`lender-verify=${d.verificationToken}`}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.status === "pending" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void checkDns(d._id)}
                      >
                        Check DNS
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void vercelRegister(d._id)}
                      >
                        Register on Vercel
                      </Button>
                    </>
                  ) : null}
                  {d.status !== "disabled" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void remove(d._id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg ? (
        <p className="text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
