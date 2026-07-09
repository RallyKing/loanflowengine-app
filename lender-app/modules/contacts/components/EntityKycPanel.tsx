"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";
import {
  CLIENT_ENTITY_TYPES,
  clientEntityTypeLabel,
  entityKycDraftFromClient,
  formatEntityFormationDate,
  parseEntityFormationDateInput,
  type ClientEntityTypeId,
  type EntityKycDraft,
} from "@/lib/contacts/entityKycTypes";

type EntityKycPanelProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  entityId: Id<"clients">;
  client: Doc<"clients">;
  canEdit: boolean;
};

function Placeholder({ children }: { children: string }) {
  return <span className="italic text-muted-foreground">{children}</span>;
}

export function EntityKycPanel({
  organizationId,
  memberUserKey,
  entityId,
  client,
  canEdit,
}: EntityKycPanelProps) {
  const patchClient = useMutation(api.hierarchyCrudMutations.patchClient);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntityKycDraft>(() =>
    entityKycDraftFromClient(client),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(entityKycDraftFromClient(client));
    }
  }, [client, editing]);

  const onCancel = useCallback(() => {
    setDraft(entityKycDraftFromClient(client));
    setEditing(false);
    setError(null);
  }, [client]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await patchClient({
        organizationId,
        memberUserKey,
        clientId: entityId,
        entityType: draft.entityType || undefined,
        ein: draft.ein.trim() || undefined,
        stateOfIncorporation: draft.stateOfIncorporation.trim() || undefined,
        dateOfFormation: parseEntityFormationDateInput(draft.dateOfFormation),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    draft,
    entityId,
    memberUserKey,
    organizationId,
    patchClient,
  ]);

  const displayEntityType = client.entityType
    ? clientEntityTypeLabel(client.entityType)
    : null;
  const displayEin = client.ein?.trim();
  const displayState = client.stateOfIncorporation?.trim();
  const displayFormation = formatEntityFormationDate(client.dateOfFormation);

  return (
    <section
      className={cn(
        "grid gap-3 border-primary/20 bg-primary/[0.03]",
        OP_WORKSPACE_ISLAND,
        "p-4",
      )}
      data-testid="entity-kyc-panel"
      aria-labelledby="entity-kyc-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="entity-kyc-heading"
            className="text-sm font-semibold text-foreground"
          >
            Entity KYC
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Corporate formation and identification details
          </p>
        </div>
        {canEdit && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="entity-kyc-edit"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
        ) : null}
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Cancel editing"
            onClick={onCancel}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-dlc-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="entity-kyc-type" className="sm:col-span-2">
            Entity type
            <select
              id="entity-kyc-type"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.entityType}
              disabled={saving}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  entityType: e.currentTarget.value as ClientEntityTypeId | "",
                }))
              }
            >
              <option value="">Select entity type…</option>
              {CLIENT_ENTITY_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </Label>
          <Label htmlFor="entity-kyc-ein">
            EIN
            <Input
              id="entity-kyc-ein"
              className="mt-1 h-10"
              value={draft.ein}
              disabled={saving}
              placeholder="XX-XXXXXXX"
              onChange={(e) =>
                setDraft((d) => ({ ...d, ein: e.target.value }))
              }
            />
          </Label>
          <Label htmlFor="entity-kyc-state">
            State of incorporation
            <Input
              id="entity-kyc-state"
              className="mt-1 h-10"
              value={draft.stateOfIncorporation}
              disabled={saving}
              placeholder="e.g. Delaware"
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  stateOfIncorporation: e.target.value,
                }))
              }
            />
          </Label>
          <Label htmlFor="entity-kyc-formation" className="sm:col-span-2">
            Date of formation
            <Input
              id="entity-kyc-formation"
              type="date"
              className="mt-1 h-10"
              value={draft.dateOfFormation}
              disabled={saving}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  dateOfFormation: e.target.value,
                }))
              }
            />
          </Label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={saving}
              data-testid="entity-kyc-save"
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save KYC"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Entity type
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {displayEntityType || (
                <Placeholder>Add entity type…</Placeholder>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">EIN</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {displayEin || <Placeholder>Add EIN…</Placeholder>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              State of incorporation
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {displayState || (
                <Placeholder>Add state of incorporation…</Placeholder>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Date of formation
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {displayFormation || (
                <Placeholder>Add date of formation…</Placeholder>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
