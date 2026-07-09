"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/lib/sessionUiClient";
import {
  getStoredActiveOrganizationId,
  setStoredActiveOrganizationId,
} from "@/lib/activeOrganizationId";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Variant = "default" | "sidebar";

/**
 * Tenant switcher for Convex global admins (`authUsers.isGlobalAdmin`).
 * Uses `listAllOrganizations` (see `convex/organizationResolver.ts`).
 */
export function GlobalTenantSwitcher({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: Variant;
}) {
  const { isSignedIn, isGlobalAdmin, userId } = useAuth();
  const { activeOrganizationId } = useOrgPermissions();
  const orgs = useQuery(
    api.organizationResolver.listAllOrganizations,
    isSignedIn && isGlobalAdmin && userId
      ? { memberUserKey: userId }
      : "skip",
  );

  const options = useMemo(() => orgs ?? [], [orgs]);

  const selectClass =
    variant === "sidebar"
      ? "w-full rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-sm text-white"
      : "w-full max-w-md rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  if (!isSignedIn || !isGlobalAdmin || !userId) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <label
        className={cn(
          "text-xs font-medium",
          variant === "sidebar" ? "text-white/75" : "text-muted-foreground",
        )}
      >
        Active tenant
      </label>
      <Select
        className={selectClass}
        value={activeOrganizationId ?? getStoredActiveOrganizationId() ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (!v) return;
          setStoredActiveOrganizationId(v as Id<"organizations">);
          window.location.reload();
        }}
        disabled={orgs === undefined}
      >
        {options.length === 0 ? (
          <option value="">Loading workspaces…</option>
        ) : (
          options.map((o) => (
            <option key={o._id} value={o._id}>
              {o.name}
            </option>
          ))
        )}
      </Select>
      <p
        className={cn(
          "text-[10px] text-muted-foreground",
          variant === "sidebar" && "text-white/70",
        )}
      >
        GodMode — you can open any organization. Reload applies data scope.
      </p>
    </div>
  );
}
