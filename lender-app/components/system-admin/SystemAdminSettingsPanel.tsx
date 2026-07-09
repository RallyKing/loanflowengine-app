"use client";

import Link from "next/link";
import { settingsHref } from "@/lib/settingsRegistry";
import { useViewer } from "@/lib/sessionContext";
import { GlobalTenantSwitcher } from "@/components/system-admin/GlobalTenantSwitcher";
import { SuperuserImpersonationPanel } from "@/components/system-admin/SuperuserImpersonationPanel";

/** Settings hub section: global admin + superuser impersonation. */
export function SystemAdminSettingsPanel() {
  const viewer = useViewer();

  return (
    <div className="space-y-6">
      <SuperuserImpersonationPanel />
      {viewer?.canSuperuserImpersonate ? null : (
        <>
          <p className="text-sm text-muted-foreground">
            As a system administrator, you can jump to any workspace tenant. Convex RBAC
            grants full permissions while you operate in that context. Switching reloads
            the app so org-scoped queries and subscriptions realign.
          </p>
          <GlobalTenantSwitcher />
          <p className="text-xs text-muted-foreground">
            Use the same control from the green sidebar (saas layout) and the Lenders
            workspace shortcut. Navigation settings include a profile picker for every
            account under{" "}
            <Link href={settingsHref("navigation")} className="underline">
              Navigation
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
