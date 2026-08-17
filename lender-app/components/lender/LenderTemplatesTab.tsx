"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Paperclip, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import {
  postFileToConvexUploadUrl,
  validateTaskAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

/**
 * Lender-scoped task playbooks (taskTemplateGroups.lenderId).
 * Apply to a pipeline file via the existing TaskTemplateApplyModal / file workspace.
 */
export function LenderTemplatesTab({
  lenderId,
  lenderCompany,
  canUseHub,
  actionTitle,
}: {
  lenderId: Id<"lenders">;
  lenderCompany: string;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
}) {
  const orgScope = useOrgConvexQueryArgs();
  const { confirm } = useOperationalConfirm();

  const groups =
    useQuery(
      api.taskTemplateLibrary.listGroupsForLender,
      orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
            lenderId,
          }
        : "skip",
    ) ?? [];

  const triageLabelsRaw = useQuery(
    api.organizationTriageLabels.listTriageLabels,
    orgScope
      ? {
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
        }
      : "skip",
  );
  const triageLabels = useMemo(
    () => triageLabelsRaw ?? [],
    [triageLabelsRaw],
  );

  const [selectedGroupId, setSelectedGroupId] =
    useState<Id<"taskTemplateGroups"> | null>(null);
  const activeGroupId = selectedGroupId ?? groups[0]?._id ?? null;

  const templates =
    useQuery(
      api.taskTemplateLibrary.listTemplatesInGroup,
      orgScope && activeGroupId
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
            templateGroupId: activeGroupId,
          }
        : "skip",
    ) ?? [];

  const upsertGroup = useMutation(api.taskTemplateLibrary.upsertTemplateGroup);
  const upsertTemplate = useMutation(api.taskTemplateLibrary.upsertTaskTemplate);
  const deleteGroup = useMutation(api.taskTemplateLibrary.deleteTemplateGroup);
  const deleteTemplate = useMutation(api.taskTemplateLibrary.deleteTaskTemplate);
  const genUploadUrl = useMutation(
    api.taskTemplateLibrary.generateTemplateAttachmentUploadUrl,
  );

  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateLabelId, setTemplateLabelId] = useState("");
  const [attachmentMeta, setAttachmentMeta] = useState<{
    storageId: Id<"_storage">;
    fileName: string;
    contentType?: string;
    size?: number;
  } | null>(null);
  const [editingTemplateId, setEditingTemplateId] =
    useState<Id<"taskTemplates"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const labelOptions = useMemo(
    () => [
      { id: "", label: "None (regular task)" },
      ...triageLabels.map((l) => ({ id: l._id, label: l.label })),
    ],
    [triageLabels],
  );

  const resetTemplateForm = useCallback(() => {
    setTemplateTitle("");
    setTemplateDescription("");
    setTemplateLabelId("");
    setAttachmentMeta(null);
    setEditingTemplateId(null);
  }, []);

  const saveGroup = async () => {
    if (!orgScope || !canUseHub) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await upsertGroup({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        name: groupName.trim() || `${lenderCompany} playbook`,
        description: groupDescription || undefined,
        lenderId,
      });
      setSelectedGroupId(result.id);
      setGroupName("");
      setGroupDescription("");
      setMsg("Playbook group created for this lender.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save group.");
    } finally {
      setBusy(false);
    }
  };

  const onPickAttachment = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !orgScope || !canUseHub) return;
    setBusy(true);
    setMsg(null);
    try {
      const postUrl = await genUploadUrl({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        lenderId,
      });
      const { storageId } = await postFileToConvexUploadUrl(postUrl, file, {
        validateFile: validateTaskAttachmentFile,
      });
      setAttachmentMeta({
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    if (!orgScope || !canUseHub || !activeGroupId) return;
    if (!templateTitle.trim()) {
      setMsg("Task title is required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await upsertTemplate({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        templateId: editingTemplateId ?? undefined,
        templateGroupId: activeGroupId,
        title: templateTitle,
        description: templateDescription || undefined,
        triageLabelId: templateLabelId
          ? (templateLabelId as Id<"organizationTriageLabels">)
          : undefined,
        ...(attachmentMeta
          ? {
              attachmentStorageId: attachmentMeta.storageId,
              attachmentFileName: attachmentMeta.fileName,
              attachmentContentType: attachmentMeta.contentType,
              attachmentSize: attachmentMeta.size,
            }
          : {}),
      });
      resetTemplateForm();
      setMsg(editingTemplateId ? "Task template updated." : "Task template added.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Create task groupings (playbooks) specific to this lender. From a pipeline
        file, use <span className="font-medium text-foreground">Apply playbook</span>{" "}
        — lender-bound groups are suggested when this lender is on the file.
        Template docs attach to each task and clone onto the file when applied.
      </p>

      {msg && (
        <p className="text-xs text-muted-foreground" role="status">
          {msg}
        </p>
      )}

      <CollapsibleSection
        variant="card"
        defaultOpen
        title={
          <span className="flex items-center gap-2 normal-case text-foreground">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Playbook groups
          </span>
        }
      >
        {groups.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            No playbooks for this lender yet.
          </p>
        ) : (
          <ul className="mb-3 space-y-1">
            {groups.map((g) => (
              <li key={g._id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${
                    activeGroupId === g._id
                      ? "bg-dlc-surface-high font-medium shadow-dlc-1"
                      : "hover:bg-muted/60"
                  }`}
                  onClick={() => setSelectedGroupId(g._id)}
                >
                  <span className="truncate">{g.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {g.templateCount} task{g.templateCount === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-md border border-dashed p-3">
          <Label>New playbook group</Label>
          <Input
            placeholder={`${lenderCompany} intake`}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            disabled={!canUseHub}
          />
          <Textarea
            rows={2}
            placeholder="Optional description"
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            disabled={!canUseHub}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canUseHub || busy}
              onClick={() => void saveGroup()}
              title={actionTitle("Create a playbook group for this lender")}
            >
              <Plus className="h-3.5 w-3.5" /> Create group
            </Button>
          </div>
        </div>

        {activeGroupId && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canUseHub || busy}
              onClick={() => {
                void (async () => {
                  if (!orgScope) return;
                  const g = groups.find((x) => x._id === activeGroupId);
                  const ok = await confirm(
                    simpleDeleteConfirm(g?.name ?? "playbook", {
                      title: "Delete playbook group",
                      impact:
                        "All task templates in this group are removed. Tasks already on files are kept.",
                    }),
                  );
                  if (!ok) return;
                  await deleteGroup({
                    organizationId: orgScope.organizationId,
                    memberUserKey: orgScope.memberUserKey,
                    groupId: activeGroupId,
                  });
                  setSelectedGroupId(null);
                  setMsg("Playbook group deleted.");
                })();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" /> Delete group
            </Button>
          </div>
        )}
      </CollapsibleSection>

      {activeGroupId && (
        <CollapsibleSection
          variant="card"
          defaultOpen
          title={
            <span className="text-sm font-semibold normal-case text-foreground">
              Tasks in playbook
            </span>
          }
        >
          {templates.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">
              No task templates in this group yet.
            </p>
          ) : (
            <ul className="mb-3 space-y-2">
              {templates.map((t) => (
                <li
                  key={t._id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border/70 bg-muted/20 p-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {t.description}
                      </div>
                    )}
                    {t.attachmentFileName && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Paperclip className="h-3 w-3" aria-hidden />
                        {t.attachmentFileName}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!canUseHub}
                      onClick={() => {
                        setEditingTemplateId(t._id);
                        setTemplateTitle(t.title);
                        setTemplateDescription(t.description ?? "");
                        setTemplateLabelId(t.triageLabelId ?? "");
                        setAttachmentMeta(null);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={!canUseHub}
                      onClick={() => {
                        void (async () => {
                          if (!orgScope) return;
                          const ok = await confirm(
                            simpleDeleteConfirm(t.title, {
                              title: "Delete task template",
                            }),
                          );
                          if (!ok) return;
                          await deleteTemplate({
                            organizationId: orgScope.organizationId,
                            memberUserKey: orgScope.memberUserKey,
                            templateId: t._id,
                          });
                        })();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label>
              {editingTemplateId ? "Edit task template" : "Add task template"}
            </Label>
            <Input
              placeholder="Task title"
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              disabled={!canUseHub}
            />
            <Textarea
              rows={2}
              placeholder="Description (optional)"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              disabled={!canUseHub}
            />
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={templateLabelId}
              onChange={(e) => setTemplateLabelId(e.target.value)}
              disabled={!canUseHub}
              aria-label="Triage label"
            >
              {labelOptions.map((o) => (
                <option key={o.id || "none"} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-muted">
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                {attachmentMeta
                  ? attachmentMeta.fileName
                  : "Attach template doc"}
                <input
                  type="file"
                  className="sr-only"
                  disabled={!canUseHub || busy}
                  onChange={(e) => void onPickAttachment(e)}
                />
              </label>
              {attachmentMeta && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setAttachmentMeta(null)}
                >
                  Clear file
                </Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {editingTemplateId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetTemplateForm}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={!canUseHub || busy}
                onClick={() => void saveTemplate()}
                title={actionTitle("Save task template")}
              >
                {editingTemplateId ? "Update task" : "Add task"}
              </Button>
            </div>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
