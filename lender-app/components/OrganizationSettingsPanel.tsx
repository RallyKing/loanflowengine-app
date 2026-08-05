"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/sessionUiClient";
import { useViewer } from "@/lib/sessionContext";
import { useMutation, useQueries, type RequestForQueries, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import type { OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import { useUserSettings } from "@/lib/userSettingsContext";
import {
  normalizeOrganizationPlan,
  ORGANIZATION_PLANS,
} from "@/lib/orgPlanFeatures";
import {
  postFileToConvexUploadUrl,
  validateBrandingLogoFile,
} from "@/lib/uploadToConvexStorage";
import { settingsHref } from "@/lib/settingsRegistry";
import { PlanLimitUpgradeBanner } from "@/components/PlanLimitUpgradeBanner";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { OrganizationContactRolesPanel } from "@/components/settings/OrganizationContactRolesPanel";
import { OrganizationTriageLabelsPanel } from "@/components/settings/OrganizationTriageLabelsPanel";
import { OrganizationTaskSnoozeDefaultsPanel } from "@/components/settings/OrganizationTaskSnoozeDefaultsPanel";

function OrganizationBrandingSection({
  orgScope,
  convexOrg,
}: {
  orgScope: OrgScopedConvexArgs;
  convexOrg: Doc<"organizations">;
}) {
  const { confirm } = useOperationalConfirm();
  const brandQueries = useMemo((): RequestForQueries => ({
    brandPreview: {
      query: api.organizations.brandingForMember,
      args: {
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
      },
    },
  }), [orgScope.organizationId, orgScope.memberUserKey]);

  const brandResults = useQueries(brandQueries);
  const brandRaw = brandResults.brandPreview;
  const brandPreview = brandRaw instanceof Error ? null : brandRaw;
  const updateBranding = useMutation(
    api.organizations.updateOrganizationBranding,
  );
  const genLogoUrl = useMutation(
    api.organizations.generateBrandingLogoUploadUrl,
  );

  const [appName, setAppName] = useState(
    convexOrg.branding?.appName ?? "",
  );
  const [primary, setPrimary] = useState(
    convexOrg.branding?.primaryColor ?? "",
  );
  const [secondary, setSecondary] = useState(
    convexOrg.branding?.secondaryColor ?? "",
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const b = convexOrg.branding;
    setAppName(b?.appName ?? "");
    setPrimary(b?.primaryColor ?? "");
    setSecondary(b?.secondaryColor ?? "");
  }, [
    convexOrg._id,
    convexOrg.branding,
  ]);

  const save = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateBranding({
        organizationId: orgScope.organizationId,
        actorUserKey: orgScope.memberUserKey,
        patch: {
          appName: appName.trim() ? appName.trim() : null,
          primaryColor: primary.trim() ? primary.trim() : null,
          secondaryColor: secondary.trim() ? secondary.trim() : null,
        },
      });
      setMsg("Branding saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [
    appName,
    primary,
    secondary,
    orgScope.memberUserKey,
    orgScope.organizationId,
    updateBranding,
  ]);

  const removeLogo = useCallback(async () => {
    const ok = await confirm({
      ...simpleDeleteConfirm("Custom logo", {
        title: "Remove logo",
        impact: "Your organization will use the default branding.",
      }),
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateBranding({
        organizationId: orgScope.organizationId,
        actorUserKey: orgScope.memberUserKey,
        patch: { logoStorageId: null },
      });
      setMsg("Logo removed.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not remove logo.");
    } finally {
      setBusy(false);
    }
  }, [orgScope.memberUserKey, orgScope.organizationId, updateBranding, confirm]);

  const onPickLogo = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      setMsg(null);
      try {
        const postUrl = await genLogoUrl({
          organizationId: orgScope.organizationId,
          actorUserKey: orgScope.memberUserKey,
        });
        const { storageId } = await postFileToConvexUploadUrl(postUrl, file, {
          validateFile: validateBrandingLogoFile,
        });
        await updateBranding({
          organizationId: orgScope.organizationId,
          actorUserKey: orgScope.memberUserKey,
          patch: { logoStorageId: storageId as Id<"_storage"> },
        });
        setMsg("Logo updated.");
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Logo upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [genLogoUrl, orgScope.memberUserKey, orgScope.organizationId, updateBranding],
  );

  return (
    <div className="space-y-3 rounded-lg border border-border/80 p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          White-label branding
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Logo, app name, and colors apply to this organization for all members.
          Buttons and accents use the secondary color when set; otherwise they
          derive from primary.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Logo</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {brandPreview?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandPreview.logoUrl}
                alt=""
                className="h-12 w-12 rounded-md border border-border object-contain bg-muted/30"
                width={48}
                height={48}
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                None
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={(ev) => void onPickLogo(ev)}
              />
              <span className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium shadow-sm hover:bg-muted">
                {busy ? "…" : "Upload"}
              </span>
            </label>
            {brandPreview?.logoUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void removeLogo()}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            PNG, JPEG, WebP, SVG, or GIF · max 2 MB
          </p>
        </div>
      </div>

      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">
            App name (header)
          </label>
          <Input
            className="mt-0.5"
            placeholder={convexOrg.name}
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Leave empty to use the organization name ({convexOrg.name}).
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Primary color
          </label>
          <Input
            className="mt-0.5 font-mono text-xs"
            placeholder="#0b4133"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Secondary color
          </label>
          <Input
            className="mt-0.5 font-mono text-xs"
            placeholder="#1a73e8"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save branding"}
        </Button>
        {msg ? (
          <p className="text-xs text-muted-foreground">{msg}</p>
        ) : null}
      </div>
    </div>
  );
}

type TenantRole = "owner" | "admin" | "member";

export function OrganizationSettingsPanel() {
  const { confirm } = useOperationalConfirm();
  const { isLoaded, isSignedIn } = useAuth();
  const viewer = useViewer();
  const actorKey = useActorUserKey();
  const orgScope = useOrgConvexQueryArgs();
  const { can, effective } = useOrgPermissions();
  const { settings } = useUserSettings();

  const convexOrg = useQuery(
    api.organizations.get,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );

  const canInvite = can("org.members.invite");
  const canManageRoles = can("org.roles.manage");

  const members = useQuery(
    api.organizations.listMembers,
    orgScope ? orgScope : "skip",
  );

  const roles = useQuery(
    api.organizations.listRoles,
    orgScope && (canInvite || canManageRoles)
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );

  const entitlements = useQuery(
    api.organizationPlan.featureEntitlements,
    orgScope ? orgScope : "skip",
  );

  const addMember = useMutation(api.organizations.addMember);
  const removeMember = useMutation(api.organizations.removeMember);
  const setProductRole = useMutation(api.organizations.setMemberProductRole);
  const renameOrganization = useMutation(api.organizations.renameOrganization);
  const setOrganizationPlan = useMutation(api.organizationPlan.setOrganizationPlan);

  const rosterEditable = canInvite;
  const productRoleEditable = canManageRoles;

  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameMsg, setRenameMsg] = useState<string | null>(null);

  const [newUserKey, setNewUserKey] = useState("");
  const [newTenantRole, setNewTenantRole] = useState<TenantRole>("member");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [planBusy, setPlanBusy] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  /** Same payload as `OrgPermissionsProvider` (useQueries — no throw on server error). */
  const myTenantRole = effective?.tenantRole;

  const submitRename = useCallback(async () => {
    if (!orgScope || !renameDraft.trim()) return;
    setRenameBusy(true);
    setRenameMsg(null);
    try {
      await renameOrganization({
        organizationId: orgScope.organizationId,
        name: renameDraft.trim(),
        actorUserKey: orgScope.memberUserKey,
      });
      setRenameMsg("Saved.");
      setRenameDraft("");
    } catch (e) {
      setRenameMsg(e instanceof Error ? e.message : "Renaming failed.");
    } finally {
      setRenameBusy(false);
    }
  }, [orgScope, renameDraft, renameOrganization]);

  const submitPlanChange = useCallback(
    async (nextPlan: (typeof ORGANIZATION_PLANS)[number]) => {
      if (!orgScope || !convexOrg) return;
      const cur = normalizeOrganizationPlan(convexOrg.plan);
      if (nextPlan === cur) return;
      setPlanBusy(true);
      setPlanMsg(null);
      try {
        await setOrganizationPlan({
          organizationId: orgScope.organizationId,
          actorUserKey: orgScope.memberUserKey,
          plan: nextPlan,
        });
        setPlanMsg("Plan updated.");
      } catch (e) {
        setPlanMsg(e instanceof Error ? e.message : "Could not update plan.");
      } finally {
        setPlanBusy(false);
      }
    },
    [orgScope, convexOrg, setOrganizationPlan],
  );

  const submitAddMember = useCallback(async () => {
    if (!orgScope || !newUserKey.trim()) return;
    if (newTenantRole === "owner" && myTenantRole !== "owner") return;
    const key = newUserKey.trim();
    const already = members?.some((m) => m.userKey === key);
    if (!already && entitlements?.atMemberLimit) {
      setAddMsg(
        "This team has reached its member seat limit. Upgrade under Settings → Team billing, remove a member, or ask an admin.",
      );
      return;
    }
    setAddBusy(true);
    setAddMsg(null);
    try {
      await addMember({
        organizationId: orgScope.organizationId,
        userKey: key,
        role: newTenantRole,
        actorUserKey: orgScope.memberUserKey,
      });
      setNewUserKey("");
      setNewTenantRole("member");
      setAddMsg("Member added or updated.");
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : "Could not add member.");
    } finally {
      setAddBusy(false);
    }
  }, [
    orgScope,
    newUserKey,
    newTenantRole,
    myTenantRole,
    addMember,
    members,
    entitlements?.atMemberLimit,
  ]);

  const updateTenantRole = useCallback(
    async (userKey: string, role: TenantRole) => {
      if (!orgScope) return;
      if (role === "owner" && myTenantRole !== "owner") return;
      await addMember({
        organizationId: orgScope.organizationId,
        userKey,
        role,
        actorUserKey: orgScope.memberUserKey,
      });
    },
    [orgScope, myTenantRole, addMember],
  );

  const updateProductRole = useCallback(
    async (userKey: string, assignedRoleId: Id<"organizationRoles">) => {
      if (!orgScope) return;
      await setProductRole({
        organizationId: orgScope.organizationId,
        userKey,
        assignedRoleId,
        actorUserKey: orgScope.memberUserKey,
      });
    },
    [orgScope, setProductRole],
  );

  const onRemove = useCallback(
    async (userKey: string) => {
      if (!orgScope || userKey === actorKey) return;
      const member = members?.find((m) => m.userKey === userKey);
      const entityName =
        member?.canonicalDisplayUsername?.trim() ||
        member?.displayUsername?.trim() ||
        userKey;
      const ok = await confirm({
        variant: "remove_collaborator",
        title: "Remove member",
        entityName,
        impact: "They will lose access to this organization.",
      });
      if (!ok) return;
      try {
        await removeMember({
          organizationId: orgScope.organizationId,
          userKey,
          actorUserKey: orgScope.memberUserKey,
        });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Could not remove.");
      }
    },
    [orgScope, actorKey, removeMember, members, confirm],
  );

  const stripeLocksManualPlan =
    convexOrg != null &&
    convexOrg.planSource === "stripe" &&
    Boolean(convexOrg.stripeSubscriptionId?.trim()) &&
    ["active", "trialing", "past_due", "paused"].includes(
      (convexOrg.subscriptionStatus ?? "").trim(),
    );

  const blockNewMemberSeat =
    Boolean(entitlements?.atMemberLimit) &&
    !members?.some((m) => m.userKey === newUserKey.trim()) &&
    Boolean(newUserKey.trim());

  if (!isLoaded) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading account…
      </p>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-sm">
        <p className="font-medium text-foreground">Sign in required</p>
        <p className="mt-1 text-muted-foreground">
          Organization management uses your workspace session. Sign in to view
          members, roles, and billing.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted hover:border-primary/35"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!viewer) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading workspace…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border/80 bg-muted/15 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
              Active team
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Members, tenant roles (owner / admin / member), and product roles are
              managed in this workspace. Billing and plan changes live under Team billing.
            </p>
          </div>
          <Link
            href={settingsHref("organization")}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted hover:border-primary/35"
          >
            Settings overview
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Link>
        </div>
      </div>

      {orgScope && convexOrg && (
        <div className="space-y-3 rounded-lg border border-border/80 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Workspace record
          </h3>
          <p className="text-sm text-muted-foreground">
            Team workspace settings. Billing and plan changes live under Team billing.
          </p>
          {canInvite ? (
            <div className="mt-3 flex max-w-lg flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Rename organization
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  className="max-w-sm"
                  placeholder="Organization name"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={renameBusy || !renameDraft.trim()}
                  onClick={() => void submitRename()}
                >
                  {renameBusy ? "Saving…" : "Save name"}
                </Button>
              </div>
              {renameMsg ? (
                <p className="text-xs text-muted-foreground">{renameMsg}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {orgScope && convexOrg ? (
        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">Billing</h3>
          <p className="text-sm text-muted-foreground">
            Plans, invoices, and Stripe customer portal live in{" "}
            <Link
              href={settingsHref("billing")}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Team billing
            </Link>
            .
          </p>
          {canManageRoles ? (
            <Link
              href={settingsHref("billing")}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors",
                "hover:bg-muted hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              )}
            >
              Open team billing
            </Link>
          ) : null}
        </div>
      ) : null}

      {orgScope && convexOrg ? (
        <div className="space-y-3 rounded-lg border border-border/80 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Feature tier
          </h3>
          <p className="text-sm text-muted-foreground">
            The effective plan controls feature gates (advanced pipeline sections,
            automation, integrations). With an active Stripe subscription, the plan
            follows your subscription; otherwise you can set it manually if you have
            role access.
          </p>
          {canManageRoles ? (
            <div className="flex max-w-md flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Plan {!stripeLocksManualPlan ? "(manual)" : " (Stripe-managed)"}
              </label>
              <Select
                className="w-full max-w-xs capitalize"
                value={normalizeOrganizationPlan(convexOrg.plan)}
                disabled={planBusy || stripeLocksManualPlan}
                onChange={(e) =>
                  void submitPlanChange(
                    e.target.value as (typeof ORGANIZATION_PLANS)[number],
                  )
                }
              >
                {ORGANIZATION_PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              {stripeLocksManualPlan ? (
                <p className="text-xs text-muted-foreground">
                  This team is billed through Stripe — change the plan in{" "}
                  <Link
                    href={settingsHref("billing")}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Team billing
                  </Link>{" "}
                  or use the customer portal there.
                </p>
              ) : null}
              {planMsg ? (
                <p className="text-xs text-muted-foreground">{planMsg}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm capitalize text-foreground">
              Current plan:{" "}
              <span className="font-medium">
                {normalizeOrganizationPlan(convexOrg.plan)}
              </span>
              {convexOrg.planSource ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({convexOrg.planSource})
                </span>
              ) : null}
            </p>
          )}
        </div>
      ) : null}

      {orgScope && convexOrg && can("settings.manage") ? (
        <OrganizationContactRolesPanel orgScope={orgScope} />
      ) : null}

      {orgScope && convexOrg && can("settings.manage") ? (
        <OrganizationTriageLabelsPanel orgScope={orgScope} />
      ) : null}

      {orgScope && can("settings.manage") ? (
        <OrganizationTaskSnoozeDefaultsPanel orgScope={orgScope} />
      ) : null}

      {orgScope && can("settings.manage") ? (
        <div className="rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">Portal defaults</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create reusable portal templates for clients, lenders, referrers, and
            deal partners. Assign them on contacts for Portals &amp; Progress.
          </p>
          <Link
            href="/settings/portal-defaults"
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-muted"
          >
            Open portal defaults editor
          </Link>
        </div>
      ) : null}

      {orgScope && can("settings.manage") ? (
        <div className="rounded-lg border border-border/80 bg-muted/10 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">Task playbooks</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Build reusable task groups with attachments for pipeline files.
          </p>
          <Link
            href="/settings/tasks/library"
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-muted"
          >
            Open task library
          </Link>
        </div>
      ) : null}

      {orgScope && convexOrg && can("settings.access") ? (
        <OrganizationBrandingSection
          orgScope={orgScope}
          convexOrg={convexOrg}
        />
      ) : null}

      {orgScope ? (
        <div className="space-y-3 rounded-lg border border-border/80 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">Members</h3>
          {!canInvite ? (
            <p className="text-sm text-muted-foreground">
              You can view the member list. Only teammates with invite permissions
              can add, remove, or change roles in this workspace.
            </p>
          ) : null}
          {orgScope && entitlements ? (
            <p className="text-xs text-muted-foreground">
              Seats:{" "}
              <span className="font-medium text-foreground">
                {entitlements.usage.memberCount}
                {entitlements.limits.maxMembers != null
                  ? ` / ${entitlements.limits.maxMembers}`
                  : " (no limit)"}
              </span>
              <span className="capitalize"> · {entitlements.plan}</span>
            </p>
          ) : null}
          {orgScope && entitlements?.atMemberLimit && rosterEditable ? (
            <PlanLimitUpgradeBanner
              variant="members"
              message={
                entitlements.limits.maxMembers != null
                  ? `This team has ${entitlements.usage.memberCount} of ${entitlements.limits.maxMembers} seats on the ${entitlements.plan} plan. You can still update existing members below.`
                  : undefined
              }
            />
          ) : null}
          {canInvite && rosterEditable ? (
            <p className="text-xs text-muted-foreground">
              Add teammates below with their stable user id from your identity provider.
            </p>
          ) : null}

          {canInvite && rosterEditable ? (
            <div className="flex max-w-xl flex-col gap-2 rounded-md border border-dashed border-border/70 bg-background/50 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-xs text-muted-foreground"> User id</label>
                <Input
                  className="mt-0.5 font-mono text-xs"
                  placeholder="user_…"
                  value={newUserKey}
                  onChange={(e) => setNewUserKey(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-40">
                <label className="text-xs text-muted-foreground">Role</label>
                <Select
                  className="mt-0.5"
                  value={newTenantRole}
                  onChange={(e) =>
                    setNewTenantRole(e.target.value as TenantRole)
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  {myTenantRole === "owner" ? (
                    <option value="owner">Owner</option>
                  ) : null}
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={addBusy || !newUserKey.trim() || blockNewMemberSeat}
                onClick={() => void submitAddMember()}
              >
                {addBusy ? "Adding…" : "Add / update"}
              </Button>
            </div>
          ) : null}
          {addMsg ? <p className="text-xs text-muted-foreground">{addMsg}</p> : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table
              className={dataTableClassNames(
                settings.tableDensity,
                "w-full min-w-[640px] text-sm",
              )}
            >
              <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Team role</th>
                  <th className="px-3 py-2 text-left">App role</th>
                  {rosterEditable && canInvite ? (
                    <th className="w-24 px-3 py-2" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((m) => (
                  <tr
                    key={m.userKey}
                    className="border-b border-border/60 odd:bg-muted/15"
                  >
                    <td className={cn("px-3 py-2 text-sm")}>
                      {m.canonicalDisplayUsername ??
                        m.displayUsername ??
                        "—"}
                      {m.userKey === actorKey ? (
                        <span className="ml-2 text-muted-foreground">(you)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {rosterEditable && canInvite ? (
                        <Select
                          className="max-w-[10rem] text-xs"
                          value={m.tenantRole}
                          onChange={(e) =>
                            void updateTenantRole(
                              m.userKey,
                              e.target.value as TenantRole,
                            )
                          }
                          disabled={m.userKey === actorKey}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          {myTenantRole === "owner" ? (
                            <option value="owner">Owner</option>
                          ) : null}
                        </Select>
                      ) : (
                        <span className="capitalize">{m.tenantRole}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {productRoleEditable && roles && roles.length > 0 ? (
                        <Select
                          className="max-w-[14rem] text-xs"
                          value={m.assignedRoleId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value as Id<"organizationRoles">;
                            if (!id) return;
                            void updateProductRole(m.userKey, id);
                          }}
                        >
                          <option value="" disabled>
                            Select…
                          </option>
                          {roles.map((r) => (
                            <option key={r._id} value={r._id}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span>{m.productRoleLabel ?? "—"}</span>
                      )}
                    </td>
                    {rosterEditable && canInvite ? (
                      <td className="px-3 py-2">
                        {m.userKey !== actorKey ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onRemove(m.userKey)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {members === undefined ? (
            <p className="text-xs text-muted-foreground">Loading members…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
