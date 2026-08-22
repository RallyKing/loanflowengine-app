"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Label, Select } from "@/components/ui/Input";
import {
  PORTAL_DEFAULT_TYPES,
  PORTAL_DEFAULT_TYPE_LABELS,
  portalDefaultTypeForContactRole,
  type PortalDefaultType,
} from "@/lib/portalDefaults";
import { cn } from "@/lib/cn";

export type ContactPortalDefaultsAssignProps = {
  contactId: Id<"contacts">;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  /** Current CRM role ids — used to highlight suggested portal types. */
  contactRoleIds?: readonly string[];
  /** Current assigned default ids from the contact document. */
  assignedIds?: readonly Id<"portalDefaults">[] | null;
  disabled?: boolean;
  className?: string;
};

/**
 * Contact hub: pick one portal default per type. Saves via assignToContact.
 */
export function ContactPortalDefaultsAssign({
  contactId,
  organizationId,
  memberUserKey,
  contactRoleIds,
  assignedIds,
  disabled,
  className,
}: ContactPortalDefaultsAssignProps) {
  const defaults = useQuery(api.portalDefaults.listForOrganization, {
    organizationId,
    memberUserKey,
  });
  const assign = useMutation(api.portalDefaults.assignToContact);

  const [draftByType, setDraftByType] = useState<
    Partial<Record<PortalDefaultType, Id<"portalDefaults"> | "">>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const byType = useMemo(() => {
    const map: Partial<
      Record<
        PortalDefaultType,
        Array<{ _id: Id<"portalDefaults">; name: string }>
      >
    > = {};
    for (const row of defaults ?? []) {
      const list = map[row.portalType] ?? [];
      list.push({ _id: row._id, name: row.name });
      map[row.portalType] = list;
    }
    return map;
  }, [defaults]);

  const resolvedSelection = useMemo(() => {
    const fromDoc: Partial<Record<PortalDefaultType, Id<"portalDefaults">>> =
      {};
    for (const id of assignedIds ?? []) {
      const row = (defaults ?? []).find((d) => d._id === id);
      if (row) fromDoc[row.portalType] = row._id;
    }
    const out: Record<PortalDefaultType, Id<"portalDefaults"> | ""> = {
      client: "",
      lender: "",
      referrer: "",
      deal_partner: "",
    };
    for (const t of PORTAL_DEFAULT_TYPES) {
      out[t] =
        draftByType[t] !== undefined
          ? (draftByType[t] as Id<"portalDefaults"> | "")
          : (fromDoc[t] ?? "");
    }
    return out;
  }, [assignedIds, defaults, draftByType]);

  const suggestedTypes = useMemo(() => {
    const set = new Set<PortalDefaultType>();
    for (const rid of contactRoleIds ?? []) {
      const t = portalDefaultTypeForContactRole(rid);
      if (t) set.add(t);
    }
    return set;
  }, [contactRoleIds]);

  const dirty = useMemo(() => {
    const current = new Set(assignedIds ?? []);
    const next = PORTAL_DEFAULT_TYPES.map((t) => resolvedSelection[t]).filter(
      Boolean,
    ) as Id<"portalDefaults">[];
    if (current.size !== next.length) return true;
    return next.some((id) => !current.has(id));
  }, [assignedIds, resolvedSelection]);

  const onSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSavedFlash(false);
    try {
      const portalDefaultIds = PORTAL_DEFAULT_TYPES.map(
        (t) => resolvedSelection[t],
      ).filter(Boolean) as Id<"portalDefaults">[];
      await assign({
        contactId,
        portalDefaultIds,
        memberUserKey,
      });
      setDraftByType({});
      setSavedFlash(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save portal defaults");
    } finally {
      setBusy(false);
    }
  }, [assign, contactId, memberUserKey, resolvedSelection]);

  return (
    <div
      className={cn(
        "space-y-3 rounded-dlc-lg border border-border/80 bg-muted/10 p-4",
        className,
      )}
      data-testid="contact-portal-defaults-assign"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Portal defaults
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When this contact is on a pipeline file, Portals &amp; Progress uses
            these templates.{" "}
            <Link
              href="/settings/portal-defaults"
              className="text-primary underline"
            >
              Manage templates
            </Link>
          </p>
        </div>
      </div>

      {defaults === undefined ? (
        <p className="text-sm text-muted-foreground">Loading defaults…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {PORTAL_DEFAULT_TYPES.map((t) => {
            const options = byType[t] ?? [];
            const suggested = suggestedTypes.has(t);
            return (
              <Label key={t} htmlFor={`contact-pd-${t}`}>
                <span className="inline-flex items-center gap-1.5">
                  {PORTAL_DEFAULT_TYPE_LABELS[t]}
                  {suggested ? (
                    <span className="rounded-dlc-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Suggested
                    </span>
                  ) : null}
                </span>
                <Select
                  id={`contact-pd-${t}`}
                  value={resolvedSelection[t]}
                  disabled={disabled || busy}
                  className="mt-1.5 min-h-10"
                  onChange={(e) =>
                    setDraftByType((prev) => ({
                      ...prev,
                      [t]: (e.target.value || "") as
                        | Id<"portalDefaults">
                        | "",
                    }))
                  }
                  data-testid={`contact-portal-default-${t}`}
                >
                  <option value="">None</option>
                  {options.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
                {options.length === 0 ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    No {PORTAL_DEFAULT_TYPE_LABELS[t].toLowerCase()} defaults
                    yet.
                  </span>
                ) : null}
              </Label>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {savedFlash && !dirty ? (
        <p className="text-xs text-emerald-700" role="status">
          Portal defaults saved.
        </p>
      ) : null}

      <Button
        type="button"
        className="min-h-10"
        disabled={disabled || busy || !dirty}
        onClick={() => void onSave()}
        data-testid="contact-portal-defaults-save"
      >
        {busy ? "Saving…" : "Save portal defaults"}
      </Button>
    </div>
  );
}
