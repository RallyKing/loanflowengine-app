"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { TimerReset } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";

/**
 * Org master switch for the 15-minute client-upload auto-review package.
 * Default ON. Does not gate immediate per-upload Alerts / Web Push.
 */
export function OrganizationClientUploadAutoReviewPanel({
  orgScope,
}: {
  orgScope: OrgScopedConvexArgs;
}) {
  const remote = useQuery(api.organizationSettings.getClientUploadAutoReviewEnabled, {
    organizationId: orgScope.organizationId,
    memberUserKey: orgScope.memberUserKey,
  });
  const setEnabled = useMutation(
    api.organizationSettings.setClientUploadAutoReviewEnabled,
  );

  const [enabled, setLocalEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (remote === undefined) return;
    setLocalEnabled(remote.enabled);
  }, [remote]);

  const onToggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setMsg(null);
      setLocalEnabled(next);
      try {
        await setEnabled({
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          enabled: next,
        });
        setMsg(
          next
            ? "Auto client-upload review enabled for this account."
            : "Auto client-upload review disabled for this account.",
        );
      } catch (caught) {
        setLocalEnabled(!next);
        setMsg(
          caught instanceof Error ? caught.message : "Could not save setting",
        );
      } finally {
        setBusy(false);
      }
    },
    [orgScope.memberUserKey, orgScope.organizationId, setEnabled],
  );

  return (
    <div
      className="rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5"
      data-testid="org-client-upload-auto-review-panel"
    >
      <div className="flex items-start gap-2">
        <TimerReset
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Auto client-upload review
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            After the last client Document Vault upload on a deal, wait 15
            minutes, then prepare a gap report and draft follow-ups for broker
            approval. Immediate upload Alerts and phone push still fire on every
            upload. Default is on while we develop this flow.
          </p>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={busy || remote === undefined}
          onChange={(e) => void onToggle(e.target.checked)}
          data-testid="org-client-upload-auto-review-toggle"
        />
        <span>
          <span className="text-sm font-medium text-foreground">
            Enable auto client-upload review (15 min)
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Account master switch. Individual deals can still turn this off in
            Document Vault settings.
          </span>
        </span>
      </label>

      {msg ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
