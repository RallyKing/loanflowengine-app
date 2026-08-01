"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Landmark, UserRound, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
} from "@/components/RecordInspectorShell";
import { RegistryRoleMultiSelect } from "@/components/registry/RegistryRoleMultiSelect";
import type { RegistryItem } from "@/lib/registry/registryItem";
import { REGISTRY_ROLE_IDS, type RegistryRoleId } from "@/lib/registry/universalRoles";
import { contactRoleIdsMutationPayload } from "@/lib/contact/contactRoles";
import { LENDER_FIELDS, blankLender, type Lender } from "@/lib/schema";

export type RegistryEditModalProps = {
  open: boolean;
  onClose: () => void;
  item: RegistryItem | null;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  onSaved?: () => void;
};

function lenderDocToUpdatePayload(doc: Doc<"lenders">): Lender {
  const payload = blankLender();
  for (const field of LENDER_FIELDS) {
    const raw = doc[field as keyof Doc<"lenders">];
    payload[field] =
      typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  payload.programList = doc.programList;
  payload.contacts = doc.contacts;
  payload.phoneNumbers = doc.phoneNumbers;
  payload.rating = doc.rating;
  payload.ratingNotes = doc.ratingNotes;
  payload.organizationId = doc.organizationId;
  return payload;
}

const TYPE_LABELS = {
  contact: "Contact",
  entity: "Entity",
  lender: "Lender",
} as const;

export function RegistryEditModal({
  open,
  onClose,
  item,
  organizationId,
  memberUserKey,
  onSaved,
}: RegistryEditModalProps) {
  const updateContact = useMutation(api.contacts.update);
  const patchClient = useMutation(api.hierarchyCrudMutations.patchClient);
  const updateLender = useMutation(api.lenders.update);

  const lenderId =
    item?.registryType === "lender" ? (item._id as Id<"lenders">) : null;

  const lenderDoc = useQuery(
    api.lenders.get,
    open && lenderId
      ? { id: lenderId, organizationId, memberUserKey }
      : "skip",
  );

  const [displayName, setDisplayName] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [roleIds, setRoleIds] = useState<RegistryRoleId[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setDisplayName(item.displayName);
    setPrimaryEmail(item.primaryEmail);
    setPrimaryPhone(item.primaryPhone);
    setRoleIds(item.roles.length > 0 ? [...item.roles] : [REGISTRY_ROLE_IDS.client]);
    setError(null);
    setSubmitting(false);
  }, [open, item]);

  const typeLabel = item ? TYPE_LABELS[item.registryType] : "Record";
  const rolesEditable = item?.registryType === "contact";
  const lenderLoading = item?.registryType === "lender" && lenderDoc === undefined;

  const TypeIcon = useMemo(() => {
    if (!item) return UserRound;
    if (item.registryType === "entity") return Building2;
    if (item.registryType === "lender") return Landmark;
    return UserRound;
  }, [item]);

  async function handleSave() {
    if (!item) return;
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (item.registryType === "contact") {
        const rolePayload = contactRoleIdsMutationPayload(roleIds);
        await updateContact({
          id: item._id as Id<"contacts">,
          name,
          email: primaryEmail.trim(),
          phone: primaryPhone.trim(),
          ...rolePayload,
          memberUserKey,
        });
      } else if (item.registryType === "entity") {
        await patchClient({
          organizationId,
          memberUserKey,
          clientId: item._id as Id<"clients">,
          displayName: name,
          primaryContactEmail: primaryEmail.trim(),
          primaryContactPhone: primaryPhone.trim(),
        });
      } else {
        if (!lenderDoc) {
          setError("Lender record is still loading.");
          return;
        }
        await updateLender({
          id: item._id as Id<"lenders">,
          organizationId,
          memberUserKey,
          ...lenderDocToUpdatePayload(lenderDoc),
          company: name,
          email: primaryEmail.trim(),
          phone: primaryPhone.trim(),
        });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !item) return null;

  return (
    <RecordInspectorShell
      onClose={onClose}
      ariaLabel={`Edit ${typeLabel}`}
      recordKind="contact"
      resizable
    >
      <RecordInspectorHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TypeIcon className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Edit {typeLabel}</h2>
              <p className="mt-1 text-dlc-body-sm text-muted-foreground">
                Update registry fields for {item.displayName}.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
      </RecordInspectorHeader>

      <RecordInspectorBody className="space-y-4 px-4 py-4 sm:px-5">
        <div data-testid="registry-edit-modal">
        <div>
          <Label htmlFor="registry-edit-name">Display name</Label>
          <Input
            id="registry-edit-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name or company"
            disabled={submitting || lenderLoading}
          />
        </div>
        <div>
          <Label htmlFor="registry-edit-email">Primary email</Label>
          <Input
            id="registry-edit-email"
            type="email"
            value={primaryEmail}
            onChange={(e) => setPrimaryEmail(e.target.value)}
            placeholder="email@example.com"
            disabled={submitting || lenderLoading}
          />
        </div>
        <div>
          <Label htmlFor="registry-edit-phone">Primary phone</Label>
          <Input
            id="registry-edit-phone"
            type="tel"
            value={primaryPhone}
            onChange={(e) => setPrimaryPhone(e.target.value)}
            placeholder="(555) 555-5555"
            disabled={submitting || lenderLoading}
          />
        </div>

        <RegistryRoleMultiSelect
          value={roleIds}
          onChange={setRoleIds}
          editable={rolesEditable}
          disabled={submitting || lenderLoading}
          aria-label="Registry roles"
        />

        {lenderLoading ? (
          <p className="text-sm text-muted-foreground">Loading lender details…</p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        </div>
      </RecordInspectorBody>

      <RecordInspectorFooter className="flex flex-wrap justify-end gap-2 px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={submitting || !displayName.trim() || lenderLoading}
          onClick={() => void handleSave()}
          data-testid="registry-edit-save"
        >
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </RecordInspectorFooter>
    </RecordInspectorShell>
  );
}
