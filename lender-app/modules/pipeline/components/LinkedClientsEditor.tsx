"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, Plus, Star, Trash2, Users } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  CLIENT_RELATIONSHIP_LABELS,
  SECONDARY_RELATIONSHIP_TYPES,
  type LinkedClientLike,
} from "@/lib/pipeline/clientRelationshipUi";
import type { ClientRelationshipType } from "@/lib/pipelineClientRelationships";
import { ClientRelationshipBadge } from "./ClientRelationshipBadge";

type Props = {
  scope: "project" | "loan" | "client";
  organizationId: Id<"organizations">;
  memberUserKey: string;
  projectId?: Id<"projects">;
  fileId?: Id<"pipeline">;
  /** Parent client for scope="client" entity links. */
  clientId?: Id<"clients">;
  readOnly?: boolean;
  compact?: boolean;
  showSyncFromProject?: boolean;
  inheritsProject?: boolean;
  /** When true, title row is rendered by {@link HubCollapsibleSubsection}. */
  suppressTitle?: boolean;
};

function ClientRowShell({
  disabled,
  listeners,
  attributes,
  children,
  ref,
  style,
  className,
}: {
  disabled?: boolean;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  attributes?: ReturnType<typeof useSortable>["attributes"];
  children: ReactNode;
  ref?: React.Ref<HTMLDivElement>;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div ref={ref} style={style} className={className}>
      <div className="flex items-start gap-2 p-2.5">
        <button
          type="button"
          className={cn(
            "mt-0.5 shrink-0 touch-none text-muted-foreground",
            disabled ? "cursor-not-allowed opacity-40" : "cursor-grab",
          )}
          aria-label="Drag to reorder"
          disabled={disabled}
          {...(attributes ?? {})}
          {...(listeners ?? {})}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function SortableClientRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <ClientRowShell
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-dlc-md border border-border/70 bg-dlc-surface-high/80",
        isDragging && "opacity-90 shadow-dlc-md",
      )}
      disabled={disabled}
      listeners={listeners}
      attributes={attributes}
    >
      {children}
    </ClientRowShell>
  );
}

function ClientLinkRow({
  id,
  disabled,
  link,
  primaryClientId,
  promoteDisabled,
  primaryLockedToProject,
  onRelationshipChange,
  onRemove,
  onPromote,
}: {
  id: string;
  disabled?: boolean;
  link: LinkedClientLike;
  primaryClientId: string | null;
  promoteDisabled?: boolean;
  /** Loan file with a parent project — primary cannot be removed here. */
  primaryLockedToProject?: boolean;
  onRelationshipChange: (type: ClientRelationshipType) => void;
  onRemove: () => void;
  onPromote: () => void;
}) {
  const isPrimary =
    link.relationshipType === "primary" ||
    (primaryClientId != null && link.clientId === primaryClientId);

  return (
    <SortableClientRow id={id} disabled={disabled || isPrimary}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="text-sm font-medium text-foreground max-md:w-full max-md:break-words max-md:whitespace-normal max-md:[overflow-wrap:anywhere] md:truncate"
            data-testid="linked-client-display-name"
          >
            {link.displayName}
          </span>
          {isPrimary ? (
            <>
              <ClientRelationshipBadge type="primary" compact />
              {primaryLockedToProject ? (
                <span
                  className="inline-flex items-center gap-1 rounded-dlc-md border border-border/80 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
                  title="Primary client is locked to the project. To change or remove the primary client, use the Change project control at the top of the workspace."
                  data-testid="linked-clients-primary-locked-hint"
                >
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Locked — use Change project above
                </span>
              ) : null}
            </>
          ) : (
            <select
              className="h-8 max-w-[9rem] rounded-dlc-md border border-border bg-background px-2 text-xs"
              value={link.relationshipType}
              disabled={disabled}
              onChange={(e) =>
                onRelationshipChange(e.target.value as ClientRelationshipType)
              }
              aria-label={`Relationship for ${link.displayName}`}
            >
              {SECONDARY_RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_RELATIONSHIP_LABELS[t]}
                </option>
              ))}
            </select>
          )}
        </div>
        {!isPrimary && !disabled ? (
          <div className="flex shrink-0 items-center gap-1">
            {!promoteDisabled ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={onPromote}
              >
                <Star className="mr-1 h-3.5 w-3.5" />
                Primary
              </Button>
            ) : (
              <span className="px-2 text-[11px] text-muted-foreground">
                Primary is set by project
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive"
              onClick={onRemove}
              aria-label={`Remove ${link.displayName}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </SortableClientRow>
  );
}

export function LinkedClientsEditor(props: Props) {
  const {
    scope,
    organizationId,
    memberUserKey,
    projectId,
    fileId,
    clientId,
    readOnly = false,
    compact = false,
    showSyncFromProject = false,
    inheritsProject = false,
    suppressTitle = false,
  } = props;

  const projectEditor = useQuery(
    api.pipelineMultiClientMutations.getProjectClientEditor,
    scope === "project" && projectId
      ? { organizationId, projectId, memberUserKey }
      : "skip",
  );
  const loanEditor = useQuery(
    api.pipelineMultiClientMutations.getLoanClientEditor,
    scope === "loan" && fileId
      ? { organizationId, fileId, memberUserKey }
      : "skip",
  );
  const clientEditor = useQuery(
    api.pipelineClientWorkspaceMutations.getClientEntityEditor,
    scope === "client" && clientId
      ? { organizationId, clientId, memberUserKey }
      : "skip",
  );
  const editor =
    scope === "project"
      ? projectEditor
      : scope === "loan"
        ? loanEditor
        : clientEditor;

  const orgClients = useQuery(
    api.pipelineHierarchyQueries.listClients,
    editor ? { organizationId, memberUserKey } : "skip",
  );

  const addProjectLink = useMutation(api.pipelineMultiClientMutations.addProjectClientLink);
  const updateProjectLink = useMutation(api.pipelineMultiClientMutations.updateProjectClientLink);
  const removeProjectLink = useMutation(api.pipelineMultiClientMutations.removeProjectClientLink);
  const reorderProjectLinks = useMutation(api.pipelineMultiClientMutations.reorderProjectClientLinks);
  const promoteProjectPrimary = useMutation(api.pipelineMultiClientMutations.promoteProjectClientToPrimary);
  const addLoanLink = useMutation(api.pipelineMultiClientMutations.addLoanClientLink);
  const updateLoanLink = useMutation(api.pipelineMultiClientMutations.updateLoanClientLink);
  const removeLoanLink = useMutation(api.pipelineMultiClientMutations.removeLoanClientLink);
  const reorderLoanLinks = useMutation(api.pipelineMultiClientMutations.reorderLoanClientLinks);
  const promoteLoanPrimary = useMutation(api.pipelineMultiClientMutations.promoteLoanClientToPrimary);
  const syncFromProject = useMutation(api.pipelineMultiClientMutations.syncLoanClientsFromProject);
  const createClient = useMutation(api.pipelineMultiClientMutations.createOrgClient);
  const addClientEntity = useMutation(api.pipelineClientWorkspaceMutations.addClientEntity);
  const removeClientEntity = useMutation(api.pipelineClientWorkspaceMutations.removeClientEntity);
  const updateClientEntity = useMutation(api.pipelineClientWorkspaceMutations.updateClientEntityLink);
  const createClientEntityAndLink = useMutation(
    api.pipelineClientWorkspaceMutations.createClientEntityAndLink,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [pending, setPending] = useState(false);

  const linkedClients = (editor?.linkedClients ?? []) as LinkedClientLike[];
  const primaryClientId =
    editor && "primaryClientId" in editor ? editor.primaryClientId : null;
  const canEdit = editor?.canEdit === true && !readOnly;
  const promoteDisabled =
    scope === "client" ||
    (scope === "loan" && Boolean(fileId) && Boolean((editor as { projectId?: string | null })?.projectId));

  const linkedIds = useMemo(
    () => new Set(linkedClients.map((l) => l.clientId)),
    [linkedClients],
  );
  const availableClients = useMemo(
    () =>
      (orgClients ?? []).filter((c) => {
        if (linkedIds.has(String(c._id))) return false;
        if (scope === "client" && clientId && String(c._id) === String(clientId)) {
          return false;
        }
        return true;
      }),
    [orgClients, linkedIds, scope, clientId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canEdit || pending || scope === "client") return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = linkedClients.map((l) => l.clientId);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(ids, oldIndex, newIndex) as Id<"clients">[];
      void run(async () => {
        if (scope === "project" && projectId) {
          await reorderProjectLinks({ organizationId, projectId, memberUserKey, orderedClientIds: next });
        } else if (scope === "loan" && fileId) {
          await reorderLoanLinks({ organizationId, fileId, memberUserKey, orderedClientIds: next });
        }
      });
    },
    [canEdit, pending, linkedClients, run, scope, projectId, fileId, organizationId, memberUserKey, reorderProjectLinks, reorderLoanLinks],
  );

  const handleAddExisting = useCallback(() => {
    if (!selectedClientId || !canEdit) return;
    void run(async () => {
      const linkedClientId = selectedClientId as Id<"clients">;
      if (scope === "project" && projectId) {
        await addProjectLink({ organizationId, projectId, clientId: linkedClientId, memberUserKey, relationshipType: "coborrower" });
      } else if (scope === "loan" && fileId) {
        await addLoanLink({ organizationId, fileId, clientId: linkedClientId, memberUserKey, relationshipType: "coborrower" });
      } else if (scope === "client" && clientId) {
        await addClientEntity({ organizationId, clientId, linkedClientId, memberUserKey, relationshipType: "entity" });
      }
      setSelectedClientId("");
      setPickerOpen(false);
    });
  }, [selectedClientId, canEdit, run, scope, projectId, fileId, clientId, organizationId, memberUserKey, addProjectLink, addLoanLink, addClientEntity]);

  const handleCreateAndAdd = useCallback(() => {
    const name = newClientName.trim();
    if (!name || !canEdit) return;
    void run(async () => {
      if (scope === "client" && clientId) {
        await createClientEntityAndLink({
          organizationId,
          clientId,
          displayName: name,
          memberUserKey,
          relationshipType: "entity",
        });
      } else {
        const { clientId: createdId } = await createClient({ organizationId, displayName: name, memberUserKey });
        if (scope === "project" && projectId) {
          await addProjectLink({ organizationId, projectId, clientId: createdId, memberUserKey, relationshipType: "coborrower" });
        } else if (scope === "loan" && fileId) {
          await addLoanLink({ organizationId, fileId, clientId: createdId, memberUserKey, relationshipType: "coborrower" });
        }
      }
      setNewClientName("");
      setPickerOpen(false);
    });
  }, [newClientName, canEdit, run, createClient, createClientEntityAndLink, organizationId, memberUserKey, scope, projectId, fileId, clientId, addProjectLink, addLoanLink]);

  if (editor === undefined) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="linked-clients-loading">
        Loading clients…
      </div>
    );
  }
  if (editor === null) return null;

  return (
    <section
      className={cn(
        suppressTitle
          ? "min-w-0"
          : cn(
              "rounded-dlc-md border border-border/70 bg-dlc-surface/60",
              compact ? "p-2" : "p-3",
            ),
      )}
      data-testid={`linked-clients-editor-${scope}`}
    >
      {!suppressTitle ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            {scope === "project"
              ? "Project clients"
              : scope === "loan"
                ? "Loan clients"
                : "Business entities"}
          </div>
          {inheritsProject ? (
            <span className="text-[11px] text-muted-foreground">
              Inherited from project
            </span>
          ) : null}
        </div>
      ) : inheritsProject ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Inherited from project
        </p>
      ) : null}

      {!canEdit ? (
        <p className="mb-2 rounded-dlc-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          View-only — you cannot edit client links on this {scope === "client" ? "client group" : scope}.
        </p>
      ) : null}

      {scope === "loan" && promoteDisabled ? (
        <p
          className="mb-2 rounded-dlc-md border border-primary/25 bg-primary/5 px-2.5 py-2 text-xs leading-relaxed text-foreground"
          data-testid="linked-clients-primary-project-signpost"
        >
          <span className="font-semibold">Primary client is locked to the project.</span>{" "}
          To change or remove the primary client, use the{" "}
          <span className="font-medium">Change project</span> control at the top of
          this workspace — do not delete the primary row here (that would orphan the
          file). Secondary clients can be added or removed below.
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={linkedClients.map((l) => l.clientId)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {linkedClients.map((link) => (
              <li key={link.clientId}>
                <ClientLinkRow
                  id={link.clientId}
                  disabled={!canEdit || pending}
                  link={link}
                  primaryClientId={primaryClientId}
                  promoteDisabled={promoteDisabled}
                  primaryLockedToProject={
                    scope === "loan" &&
                    promoteDisabled &&
                    (link.relationshipType === "primary" ||
                      (primaryClientId != null &&
                        link.clientId === primaryClientId))
                  }
                  onRelationshipChange={(relationshipType) => {
                    void run(async () => {
                      const linkedId = link.clientId as Id<"clients">;
                      if (scope === "project" && projectId) {
                        await updateProjectLink({ organizationId, projectId, clientId: linkedId, memberUserKey, relationshipType });
                      } else if (scope === "loan" && fileId) {
                        await updateLoanLink({ organizationId, fileId, clientId: linkedId, memberUserKey, relationshipType });
                      } else if (scope === "client" && clientId) {
                        await updateClientEntity({
                          organizationId,
                          clientId,
                          linkedClientId: linkedId,
                          memberUserKey,
                          relationshipType:
                            relationshipType === "primary"
                              ? "entity"
                              : relationshipType,
                        });
                      }
                    });
                  }}
                  onRemove={() => {
                    void run(async () => {
                      const linkedId = link.clientId as Id<"clients">;
                      if (scope === "project" && projectId) {
                        await removeProjectLink({ organizationId, projectId, clientId: linkedId, memberUserKey });
                      } else if (scope === "loan" && fileId) {
                        await removeLoanLink({ organizationId, fileId, clientId: linkedId, memberUserKey });
                      } else if (scope === "client" && clientId) {
                        await removeClientEntity({
                          organizationId,
                          clientId,
                          linkedClientId: linkedId,
                          memberUserKey,
                        });
                      }
                    });
                  }}
                  onPromote={() => {
                    void run(async () => {
                      const clientId = link.clientId as Id<"clients">;
                      if (scope === "project" && projectId) {
                        await promoteProjectPrimary({ organizationId, projectId, clientId, memberUserKey });
                      } else if (scope === "loan" && fileId) {
                        await promoteLoanPrimary({ organizationId, fileId, clientId, memberUserKey });
                      }
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {canEdit ? (
        <div className="mt-3 space-y-2">
          {showSyncFromProject && scope === "loan" && fileId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full"
              disabled={pending}
              onClick={() => void run(() => syncFromProject({ organizationId, fileId, memberUserKey }))}
            >
              Sync clients from project
            </Button>
          ) : null}
          {!pickerOpen ? (
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={pending} onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {scope === "client" ? "Add entity" : "Add client"}
            </Button>
          ) : (
            <div className="space-y-2 rounded-dlc-md border border-dashed border-border/80 p-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {scope === "client" ? "Existing entity" : "Existing client"}
                </span>
                <select
                  className="h-9 rounded-dlc-md border border-border bg-background px-2 text-sm"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {availableClients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" size="sm" className="h-9" disabled={!selectedClientId || pending} onClick={handleAddExisting}>
                Add selected
              </Button>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">Or create new</span>
                <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder={scope === "client" ? "Entity name" : "Client name"} className="h-9" />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!newClientName.trim() || pending} onClick={handleCreateAndAdd}>
                  Create & add
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
