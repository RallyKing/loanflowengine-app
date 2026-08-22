"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  ExternalLink,
  Landmark,
  Loader2,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { RegistryRoleMultiSelect } from "@/components/registry/RegistryRoleMultiSelect";
import { EntityWebsitesPanel } from "@/components/contacts/EntityWebsitesPanel";
import { EntityWebsitesList } from "@/components/contacts/EntityWebsitesList";
import { CopyableField } from "@/modules/contacts/workspace/CopyableField";
import type { RegistryItem } from "@/lib/registry/registryItem";
import { registryCommandCenterHref } from "@/lib/registry/registryRoutes";
import { REGISTRY_ROLE_IDS, type RegistryRoleId } from "@/lib/registry/universalRoles";
import { contactRoleIdsMutationPayload } from "@/lib/contact/contactRoles";
import { formatPhoneDisplay } from "@/lib/contact/contactMethods";
import { cn } from "@/lib/cn";

type ContactInspectorSidePanelProps = {
  item: RegistryItem;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  onClose: () => void;
  onItemPatched?: (patch: Partial<RegistryItem>) => void;
  onDelete?: () => void;
  canMutate?: boolean;
};

const TYPE_LABELS = {
  contact: "Contact",
  entity: "Entity",
  lender: "Lender",
} as const;

type SaveStatus = "idle" | "pending" | "saved" | "error";

type InspectorFormState = {
  displayName: string;
  email: string;
  phone: string;
  notes: string;
  tagsInput: string;
  roleIds: RegistryRoleId[];
};

function formFromItem(item: RegistryItem): InspectorFormState {
  return {
    displayName: item.displayName,
    email: item.primaryEmail,
    phone: formatPhoneDisplay(item.primaryPhone),
    notes: item.notes ?? "",
    tagsInput: Array.isArray(item.crmTags) ? item.crmTags.join(", ") : "",
    roleIds: item.roles.length > 0 ? [...item.roles] : [REGISTRY_ROLE_IDS.client],
  };
}

function SaveButton({
  status,
  disabled,
  onClick,
  className,
}: {
  status: SaveStatus;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      className={cn("min-h-9 gap-1.5", className)}
      disabled={disabled || status === "pending"}
      onClick={onClick}
      data-testid="contacts-inspector-save"
    >
      {status === "pending" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Save className="h-3.5 w-3.5" aria-hidden />
      )}
      {status === "pending" ? "Saving…" : status === "saved" ? "Saved" : "Save"}
    </Button>
  );
}

export function ContactInspectorSidePanel({
  item,
  organizationId,
  memberUserKey,
  onClose,
  onItemPatched,
  onDelete,
  canMutate = true,
}: ContactInspectorSidePanelProps) {
  const updateContact = useMutation(api.contacts.update);
  const patchClient = useMutation(api.hierarchyCrudMutations.patchClient);

  const entityHubDetail = useQuery(
    api.pipelineHierarchyQueries.getClientHubDetail,
    item.registryType === "entity"
      ? {
          organizationId,
          clientId: item._id as Id<"clients">,
          memberUserKey,
        }
      : "skip",
  );

  const [form, setForm] = useState<InspectorFormState>(() => formFromItem(item));
  const [baseline, setBaseline] = useState<InspectorFormState>(() => formFromItem(item));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    const next = formFromItem(item);
    setForm(next);
    setBaseline(next);
    setSaveStatus("idle");
  }, [item]);

  const typeLabel = TYPE_LABELS[item.registryType];
  const rolesEditable = item.registryType === "contact";
  const vaultHref = registryCommandCenterHref(item);
  const editable = canMutate && item.registryType !== "lender";

  const TypeIcon =
    item.registryType === "entity"
      ? Building2
      : item.registryType === "lender"
        ? Landmark
        : UserRound;

  const isDirty = useMemo(() => {
    return (
      form.displayName.trim() !== baseline.displayName.trim() ||
      form.email.trim() !== baseline.email.trim() ||
      form.phone.trim() !== baseline.phone.trim() ||
      (item.registryType === "contact" &&
        (form.notes !== baseline.notes ||
          form.tagsInput !== baseline.tagsInput ||
          JSON.stringify(form.roleIds) !== JSON.stringify(baseline.roleIds)))
    );
  }, [form, baseline, item.registryType]);

  const persistChanges = useCallback(async () => {
    if (!editable || !isDirty) return;

    setSaveStatus("pending");
    try {
      const tags = form.tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const phone = formatPhoneDisplay(form.phone);

      if (item.registryType === "contact") {
        const rolePayload = contactRoleIdsMutationPayload(form.roleIds);
        await updateContact({
          id: item._id as Id<"contacts">,
          memberUserKey,
          name: form.displayName.trim(),
          email: form.email.trim(),
          phone,
          notes: form.notes,
          crmTags: tags,
          ...rolePayload,
        });
        const itemPatch: Partial<RegistryItem> = {
          displayName: form.displayName.trim(),
          primaryEmail: form.email.trim(),
          primaryPhone: phone,
          notes: form.notes,
          crmTags: tags,
          roles: form.roleIds,
        };
        onItemPatched?.(itemPatch);
      } else if (item.registryType === "entity") {
        await patchClient({
          organizationId,
          memberUserKey,
          clientId: item._id as Id<"clients">,
          displayName: form.displayName.trim(),
          primaryContactEmail: form.email.trim(),
          primaryContactPhone: phone,
        });
        onItemPatched?.({
          displayName: form.displayName.trim(),
          primaryEmail: form.email.trim(),
          primaryPhone: phone,
        });
      }

      const savedForm = { ...form, phone, displayName: form.displayName.trim(), email: form.email.trim() };
      setForm(savedForm);
      setBaseline(savedForm);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch {
      setSaveStatus("error");
    }
  }, [
    editable,
    isDirty,
    form,
    item,
    memberUserKey,
    onItemPatched,
    organizationId,
    patchClient,
    updateContact,
  ]);

  const patchField = <K extends keyof InspectorFormState>(
    key: K,
    value: InspectorFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (saveStatus === "saved" || saveStatus === "error") setSaveStatus("idle");
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-contain bg-dlc-surface shadow-dlc-1 touch-scroll-y",
      )}
      data-contacts-panel-scroll
      data-testid="contacts-inspector-panel"
      aria-label={`${typeLabel} inspector`}
    >
      <div className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between border-b border-border/60 bg-dlc-surface px-6 py-3 shadow-sm lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <TypeIcon className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <h2 className="truncate text-base font-semibold tracking-tight">
            {item.displayName}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editable ? (
            <SaveButton
              status={saveStatus}
              disabled={!isDirty}
              onClick={() => void persistChanges()}
            />
          ) : null}
          <a
            href={vaultHref}
            className="inline-flex min-h-9 items-center gap-1 rounded-dlc-md px-2 text-xs font-medium text-primary hover:bg-muted/50"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Vault
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 min-w-9"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="overflow-visible px-6 py-6 lg:px-8 lg:py-8">
        <div className="space-y-6">
          <div>
            <Label htmlFor="inspector-name">Display name</Label>
            <Input
              id="inspector-name"
              aria-label="Display name"
              value={form.displayName}
              disabled={!editable}
              className="mt-1"
              onChange={(e) => patchField("displayName", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="inspector-email">Primary email</Label>
            <div className="mt-1 flex items-center gap-1">
              <Input
                id="inspector-email"
                aria-label="Primary email"
                value={form.email}
                disabled={!editable}
                className="min-w-0 flex-1"
                onChange={(e) => patchField("email", e.target.value)}
              />
              <CopyableField value={form.email} label="Copy email" />
            </div>
          </div>

          <div>
            <Label htmlFor="inspector-phone">Primary phone</Label>
            <div className="mt-1 flex items-center gap-1">
              <Input
                id="inspector-phone"
                aria-label="Primary phone"
                value={form.phone}
                disabled={!editable}
                className="min-w-0 flex-1"
                onChange={(e) => patchField("phone", e.target.value)}
                onBlur={() => patchField("phone", formatPhoneDisplay(form.phone))}
              />
              <CopyableField value={form.phone} label="Copy phone" />
            </div>
          </div>

          <RegistryRoleMultiSelect
            value={form.roleIds}
            onChange={(next) => patchField("roleIds", next)}
            editable={rolesEditable && editable}
            aria-label="CRM roles"
          />

          {item.registryType === "entity" ? (
            entityHubDetail?.client ? (
              <EntityWebsitesPanel
                organizationId={organizationId}
                memberUserKey={memberUserKey}
                entityId={item._id as Id<"clients">}
                client={entityHubDetail.client}
                canEdit={editable && (entityHubDetail.canEdit ?? false)}
              />
            ) : item.websites && item.websites.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium text-foreground">Websites</p>
                <EntityWebsitesList websites={item.websites} />
              </div>
            ) : null
          ) : null}

          {item.registryType === "contact" ? (
            <>
              <div>
                <Label htmlFor="inspector-notes">Notes</Label>
                <Textarea
                  id="inspector-notes"
                  value={form.notes}
                  rows={4}
                  disabled={!editable}
                  className="mt-1"
                  onChange={(e) => patchField("notes", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="inspector-tags">Tags (comma-separated)</Label>
                <Input
                  id="inspector-tags"
                  value={form.tagsInput}
                  disabled={!editable}
                  className="mt-1"
                  onChange={(e) => patchField("tagsInput", e.target.value)}
                />
              </div>
            </>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <dt className="font-medium">Link status</dt>
              <dd>{item.linkStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium">Last activity</dt>
              <dd>
                {item.lastActivityAt
                  ? new Date(item.lastActivityAt).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
          </dl>

          {editable ? (
            <div className="border-t border-border/60 pt-6">
              <SaveButton
                status={saveStatus}
                disabled={!isDirty}
                onClick={() => void persistChanges()}
                className="w-full sm:w-auto"
              />
              {saveStatus === "error" ? (
                <p className="mt-2 text-xs text-destructive" aria-live="polite">
                  Save failed — try again.
                </p>
              ) : null}
            </div>
          ) : null}

          {canMutate && onDelete ? (
            <div className="border-t border-border/60 pt-6">
              <p className="text-dlc-label-md font-semibold text-destructive">
                Danger zone
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Permanently remove this {typeLabel.toLowerCase()} from your
                organization.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10"
                data-testid="contacts-inspector-delete"
                onClick={() => onDelete()}
              >
                Delete {typeLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
