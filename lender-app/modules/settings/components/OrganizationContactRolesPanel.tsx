"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ContactRole } from "@/lib/contact/contactRoles";
import { DEFAULT_CONTACT_ROLE_IDS } from "@/lib/contact/contactRoles";
import type { OrgScopedConvexArgs } from "@/lib/useOrgConvexQueryArgs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function slugRoleId(displayName: string): string {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || `role_${Date.now()}`;
}

export function OrganizationContactRolesPanel({
  orgScope,
}: {
  orgScope: OrgScopedConvexArgs;
}) {
  const roles =
    useQuery(api.organizationSettings.getContactRoles, {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
    }) ?? [];

  const updateRoles = useMutation(api.organizationSettings.updateContactRoles);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const editing = useMemo(
    () => roles.find((r) => r.id === draftId) ?? null,
    [roles, draftId],
  );

  const startEdit = useCallback((role: ContactRole) => {
    setDraftId(role.id);
    setDraftName(role.displayName);
    setMsg(null);
  }, []);

  const startCreate = useCallback(() => {
    setDraftId(null);
    setDraftName("");
    setMsg(null);
  }, []);

  const submit = useCallback(async () => {
    const displayName = draftName.trim();
    if (!displayName) {
      setMsg("Role name is required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const next: ContactRole[] = [...roles];
      if (draftId) {
        const idx = next.findIndex((r) => r.id === draftId);
        if (idx < 0) throw new Error("Role not found.");
        const row = next[idx]!;
        next[idx] = {
          ...row,
          displayName,
        };
      } else {
        let id = slugRoleId(displayName);
        while (next.some((r) => r.id === id)) {
          id = `${id}_${Math.random().toString(36).slice(2, 6)}`;
        }
        next.push({
          id,
          displayName,
          isSystemDefault: false,
        });
      }
      await updateRoles({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        contactRoles: next,
      });
      setMsg(draftId ? "Role updated." : "Role added.");
      startCreate();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [
    draftId,
    draftName,
    orgScope.memberUserKey,
    orgScope.organizationId,
    roles,
    startCreate,
    updateRoles,
  ]);

  const removeRole = useCallback(
    async (roleId: string) => {
      if (
        roleId === DEFAULT_CONTACT_ROLE_IDS.client ||
        roleId === DEFAULT_CONTACT_ROLE_IDS.referralPartner ||
        roleId === DEFAULT_CONTACT_ROLE_IDS.dealPartner ||
        roleId === DEFAULT_CONTACT_ROLE_IDS.lenderRep
      ) {
        setMsg("System default roles cannot be removed.");
        return;
      }
      setBusy(true);
      setMsg(null);
      try {
        const next = roles.filter((r) => r.id !== roleId);
        await updateRoles({
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          contactRoles: next,
        });
        setMsg("Role removed.");
        if (draftId === roleId) startCreate();
      } catch (error) {
        setMsg(error instanceof Error ? error.message : "Remove failed.");
      } finally {
        setBusy(false);
      }
    },
    [
      draftId,
      orgScope.memberUserKey,
      orgScope.organizationId,
      roles,
      startCreate,
      updateRoles,
    ],
  );

  return (
    <section
      className="rounded-dlc-md border border-border/80 bg-dlc-surface p-4 shadow-dlc-1"
      data-testid="organization-contact-roles-panel"
    >
      <div className="mb-3 flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-foreground">CRM contact roles</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Predetermined roles for contacts (Client, Referral Partner, Deal Partner,
            Lender Rep). Custom roles can be added; system defaults stay protected.
          </p>
        </div>
      </div>

      <ul className="mb-4 space-y-2" role="list">
        {roles.map((role) => (
          <li
            key={role.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{role.displayName}</p>
              <p className="text-[11px] text-muted-foreground">
                {role.id}
                {role.isSystemDefault ? " · system default" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startEdit(role)}
              >
                Edit
              </Button>
              {!role.isSystemDefault ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void removeRole(role.id)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-md border border-dashed border-border/80 p-3">
        <p className="text-xs font-medium text-foreground">
          {editing ? `Edit “${editing.displayName}”` : "Add custom role"}
        </p>
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Role display name"
          aria-label="Contact role display name"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
            {editing ? "Save changes" : "Add role"}
          </Button>
          {editing || draftName ? (
            <Button type="button" size="sm" variant="outline" onClick={startCreate}>
              Cancel
            </Button>
          ) : null}
        </div>
        {msg ? (
          <p className="text-xs text-muted-foreground" role="status">
            {msg}
          </p>
        ) : null}
      </div>
    </section>
  );
}
