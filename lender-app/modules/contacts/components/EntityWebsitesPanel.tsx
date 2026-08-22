"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { OP_WORKSPACE_ISLAND } from "@/lib/ui/operationalInputs";
import {
  normalizeEntityWebsites,
  resolveEntityWebsites,
  validateWebsiteUrl,
  type EntityWebsite,
} from "@/lib/contacts/entityWebsites";
import { EntityWebsitesList } from "@/components/contacts/EntityWebsitesList";

type DraftRow = EntityWebsite & { key: string };

function newRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function draftsFromClient(client: Doc<"clients">): DraftRow[] {
  return resolveEntityWebsites(client).map((entry) => ({
    ...entry,
    key: newRowKey(),
  }));
}

type EntityWebsitesPanelProps = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  entityId: Id<"clients">;
  client: Doc<"clients">;
  canEdit: boolean;
  className?: string;
};

export function EntityWebsitesPanel({
  organizationId,
  memberUserKey,
  entityId,
  client,
  canEdit,
  className,
}: EntityWebsitesPanelProps) {
  const patchClient = useMutation(api.hierarchyCrudMutations.patchClient);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>(() => draftsFromClient(client));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(draftsFromClient(client));
    }
  }, [client, editing]);

  const onCancel = useCallback(() => {
    setDraft(draftsFromClient(client));
    setEditing(false);
    setError(null);
  }, [client]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      for (const row of draft) {
        if (!row.url.trim() && !row.label?.trim()) continue;
        const err = validateWebsiteUrl(row.url);
        if (err) {
          setError(err);
          setSaving(false);
          return;
        }
      }
      const websites = normalizeEntityWebsites(
        draft
          .filter((row) => row.url.trim())
          .map((row) => ({
            url: row.url,
            label: row.label?.trim() || undefined,
          })),
      );
      await patchClient({
        organizationId,
        memberUserKey,
        clientId: entityId,
        websites,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [draft, entityId, memberUserKey, organizationId, patchClient]);

  const stored = resolveEntityWebsites(client);

  return (
    <section
      className={cn(OP_WORKSPACE_ISLAND, "grid gap-3 p-4", className)}
      data-testid="entity-websites-panel"
      aria-labelledby="entity-websites-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="entity-websites-heading"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Websites
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Company sites, portals, and other entity URLs
          </p>
        </div>
        {canEdit && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="entity-websites-edit"
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
            aria-label="Cancel editing websites"
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
        <div className="grid gap-3">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No websites yet. Add one below.
            </p>
          ) : (
            <ul className="grid gap-2" role="list">
              {draft.map((row, index) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 rounded-dlc-sm border border-border bg-muted/20 p-3 sm:flex-row sm:items-end"
                >
                  <Label className="min-w-0 flex-1 grid gap-1 text-xs font-medium text-muted-foreground">
                    URL
                    <Input
                      className="h-10"
                      value={row.url}
                      disabled={saving}
                      placeholder="example.com or https://…"
                      aria-label={`Website URL ${index + 1}`}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDraft((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, url: value } : r,
                          ),
                        );
                      }}
                    />
                  </Label>
                  <Label className="grid w-full gap-1 text-xs font-medium text-muted-foreground sm:w-36">
                    Label (optional)
                    <Input
                      className="h-10"
                      value={row.label ?? ""}
                      disabled={saving}
                      placeholder="Corporate"
                      aria-label={`Website label ${index + 1}`}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDraft((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, label: value || undefined }
                              : r,
                          ),
                        );
                      }}
                    />
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    disabled={saving}
                    aria-label={`Remove website ${index + 1}`}
                    onClick={() =>
                      setDraft((prev) => prev.filter((r) => r.key !== row.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={saving}
              data-testid="entity-websites-add"
              onClick={() =>
                setDraft((prev) => [
                  ...prev,
                  { key: newRowKey(), url: "", label: undefined },
                ])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add website
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-10"
              disabled={saving}
              data-testid="entity-websites-save"
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save websites"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : stored.length > 0 ? (
        <EntityWebsitesList websites={stored} />
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {canEdit
            ? "Add company websites…"
            : "No websites on file."}
        </p>
      )}

      {editing ? (
        <p className="text-[11px] text-muted-foreground">
          URLs are accepted with or without https:// — links open securely in a
          new tab.
        </p>
      ) : null}
    </section>
  );
}
