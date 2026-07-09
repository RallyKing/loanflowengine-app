"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { AlertTriangle, Building2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import {
  CLIENT_ENTITY_TYPES,
  type ClientEntityTypeId,
} from "@/lib/contacts/entityKycTypes";

export type ConvertToEntityModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  memberUserKey: string;
  contactId: Id<"contacts">;
  contactLabel?: string;
  /** When false, stay on the current page after success (registry list refetches reactively). */
  navigateOnSuccess?: boolean;
  onConverted?: (entityId: Id<"clients">) => void;
};

export function ConvertToEntityModal({
  open,
  onClose,
  organizationId,
  memberUserKey,
  contactId,
  contactLabel,
  navigateOnSuccess = true,
  onConverted,
}: ConvertToEntityModalProps) {
  const router = useRouter();
  const convert = useMutation(api.crmConsolidation.convertContactToEntity);

  const [displayName, setDisplayName] = useState("");
  const [entityType, setEntityType] = useState<ClientEntityTypeId | "">("");
  const [ein, setEin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(contactLabel?.trim() || "");
    setEntityType("");
    setEin("");
    setConfirmed(false);
    setError(null);
  }, [open, contactLabel]);

  async function handleConvert() {
    if (!confirmed) {
      setError("Confirm that you understand this promotion is non-destructive.");
      return;
    }
    const name = displayName.trim();
    if (!name) {
      setError("Entity display name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await convert({
        organizationId,
        memberUserKey,
        contactId,
        displayName: name,
        ...(entityType ? { entityType } : {}),
        ...(ein.trim() ? { ein: ein.trim() } : {}),
      });
      onConverted?.(result.entityId);
      onClose();
      if (navigateOnSuccess) {
        router.push(`/contacts/entity/${result.entityId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const subject = contactLabel?.trim() || "this contact";

  return (
    <OverlayShell
      open
      onClose={onClose}
      layer="MODAL"
      align="bottom-sheet"
      wrapPanel={false}
      data-testid="convert-to-entity-modal"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-dlc-surface-high p-5 shadow-dlc-3">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold">Convert to entity</h2>
              <p className="mt-1 text-dlc-body-sm text-muted-foreground">
                Promote {subject} from an individual contact to a business entity
                workspace. Pipeline file links migrate to entity deal edges.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="convert-entity-name">Entity display name</Label>
            <Input
              id="convert-entity-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Acme LLC"
            />
          </div>
          <div>
            <Label htmlFor="convert-entity-type">Entity type (optional)</Label>
            <select
              id="convert-entity-type"
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={entityType}
              onChange={(e) =>
                setEntityType(e.target.value as ClientEntityTypeId | "")
              }
            >
              <option value="">Select type…</option>
              {CLIENT_ENTITY_TYPES.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="convert-entity-ein">EIN (optional)</Label>
            <Input
              id="convert-entity-ein"
              value={ein}
              onChange={(e) => setEin(e.target.value)}
              placeholder="XX-XXXXXXX"
            />
          </div>

          <div className="rounded-dlc-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="flex items-start gap-2 text-dlc-body-sm text-foreground">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              The individual contact is preserved and linked to the new entity as
              an authorized signer. Deal links migrate to the entity workspace; review
              cap table principals after conversion.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>I understand this is a non-destructive promotion.</span>
            </label>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={submitting || !displayName.trim() || !confirmed}
            onClick={() => void handleConvert()}
          >
            {submitting ? "Converting…" : "Promote to entity"}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
