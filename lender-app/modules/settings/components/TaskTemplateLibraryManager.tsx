"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Paperclip, Plus, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import {
  postFileToConvexUploadUrl,
  validateTaskAttachmentFile,
} from "@/lib/uploadToConvexStorage";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

export function TaskTemplateLibraryManager() {
  const orgScope = useOrgConvexQueryArgs();
  const { can } = useOrgPermissions();
  const canManage = can("settings.manage");
  const { confirm } = useOperationalConfirm();

  const groups =
    useQuery(
      api.taskTemplateLibrary.listTemplateGroups,
      orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
          }
        : "skip",
    ) ?? [];

  const triageLabels =
    useQuery(
      api.organizationTriageLabels.listTriageLabels,
      orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
          }
        : "skip",
    ) ?? [];

  // Phase Modular-B — bind playbook groups to lenders.
  const orgLenders =
    useQuery(
      api.lenders.list,
      orgScope
        ? {
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
            limit: 2000,
          }
        : "skip",
    ) ?? [];

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
    () => [{ id: "", label: "None (regular task)" }, ...triageLabels.map((l) => ({ id: l._id, label: l.label }))],
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
    if (!orgScope || !canManage) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await upsertGroup({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        name: groupName,
        description: groupDescription || undefined,
      });
      setSelectedGroupId(result.id);
      setGroupName("");
      setGroupDescription("");
      setMsg("Playbook group created.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save group.");
    } finally {
      setBusy(false);
    }
  };

  const onPickAttachment = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !orgScope || !canManage) return;
    setBusy(true);
    setMsg(null);
    try {
      const postUrl = await genUploadUrl({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
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
    if (!orgScope || !canManage || !activeGroupId) return;
    setBusy(true);
    setMsg(null);
    try {
      await upsertTemplate({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        templateGroupId: activeGroupId,
        templateId: editingTemplateId ?? undefined,
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
      setMsg(editingTemplateId ? "Template updated." : "Template added.");
      resetTemplateForm();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setBusy(false);
    }
  };

  const startEditTemplate = (row: Doc<"taskTemplates">) => {
    setEditingTemplateId(row._id);
    setTemplateTitle(row.title);
    setTemplateDescription(row.description ?? "");
    setTemplateLabelId(row.triageLabelId ? String(row.triageLabelId) : "");
    setAttachmentMeta(
      row.attachmentStorageId
        ? {
            storageId: row.attachmentStorageId,
            fileName: row.attachmentFileName ?? "attachment",
            contentType: row.attachmentContentType,
            size: row.attachmentSize,
          }
        : null,
    );
  };

  const removeGroup = async (group: Doc<"taskTemplateGroups">) => {
    if (!orgScope || !canManage) return;
    const ok = await confirm(
      simpleDeleteConfirm(group.name, {
        title: "Delete playbook group",
        impact: "All task templates in this group will be removed.",
      }),
    );
    if (!ok) return;
    await deleteGroup({
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
      groupId: group._id,
    });
    if (selectedGroupId === group._id) setSelectedGroupId(null);
  };

  const removeTemplate = async (template: Doc<"taskTemplates">) => {
    if (!orgScope || !canManage) return;
    const ok = await confirm(
      simpleDeleteConfirm(template.title, { title: "Delete task template" }),
    );
    if (!ok) return;
    await deleteTemplate({
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
      templateId: template._id,
    });
    if (editingTemplateId === template._id) resetTemplateForm();
  };

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization to manage task playbooks.
      </p>
    );
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        You need settings admin access to edit the task library.
      </p>
    );
  }

  return (
    <div
      className="space-y-6"
      data-testid="task-template-library-manager"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <section className="space-y-3 rounded-lg border border-border/80 p-4">
          <h2 className="text-sm font-semibold text-foreground">Playbook groups</h2>
          <ul className="space-y-1">
            {groups.map((group) => (
              <li key={group._id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    "min-h-10 flex-1 rounded-dlc-sm px-2 text-left text-sm transition-colors duration-dlc-standard",
                    activeGroupId === group._id
                      ? "bg-primary/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30",
                  )}
                  onClick={() => {
                    setSelectedGroupId(group._id);
                    resetTemplateForm();
                  }}
                >
                  {group.name}
                  <span className="ml-1 text-xs opacity-70">
                    ({group.templateCount})
                  </span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${group.name}`}
                  onClick={() => void removeGroup(group)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <Input
              placeholder="Group name (e.g. SBA 504)"
              value={groupName}
              onChange={(e) => setGroupName(e.currentTarget.value)}
              className="min-h-10"
              data-testid="template-group-name"
            />
            <Input
              placeholder="Description (optional)"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.currentTarget.value)}
              className="min-h-10"
            />
            <Button
              type="button"
              size="sm"
              className="min-h-10 w-full gap-1.5"
              disabled={busy || !groupName.trim()}
              onClick={() => void saveGroup()}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Create group
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border/80 p-4">
          {activeGroupId ? (
            <>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {groups.find((g) => g._id === activeGroupId)?.name ?? "Templates"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Task templates in this group are applied in bulk from the pipeline
                  file drawer.
                </p>
                <label className="mt-2 block max-w-sm space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Lender playbook binding
                  </span>
                  <Select
                    className="min-h-10"
                    value={
                      groups.find((g) => g._id === activeGroupId)?.lenderId
                        ? String(
                            groups.find((g) => g._id === activeGroupId)!
                              .lenderId,
                          )
                        : ""
                    }
                    disabled={busy}
                    data-testid="template-group-lender-binding"
                    onChange={(e) => {
                      const activeGroup = groups.find(
                        (g) => g._id === activeGroupId,
                      );
                      if (!activeGroup || !orgScope) return;
                      const nextLenderId = e.currentTarget.value;
                      void (async () => {
                        setBusy(true);
                        setMsg(null);
                        try {
                          await upsertGroup({
                            organizationId: orgScope.organizationId,
                            memberUserKey: orgScope.memberUserKey,
                            groupId: activeGroup._id,
                            name: activeGroup.name,
                            description: activeGroup.description,
                            lenderId: nextLenderId
                              ? (nextLenderId as Id<"lenders">)
                              : null,
                          });
                          setMsg(
                            nextLenderId
                              ? "Playbook bound to lender — it is suggested when the lender attaches to a file."
                              : "Lender binding cleared.",
                          );
                        } catch (err) {
                          setMsg(
                            err instanceof Error
                              ? err.message
                              : "Could not update binding.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    <option value="">No lender (general playbook)</option>
                    {orgLenders.map((lender) => (
                      <option key={lender._id} value={String(lender._id)}>
                        {lender.company || "Unnamed lender"}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <ul className="space-y-2">
                {templates.map((tmpl) => (
                  <li
                    key={tmpl._id}
                    className="flex items-start justify-between gap-2 rounded-dlc-sm border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {tmpl.title}
                      </p>
                      {tmpl.description ? (
                        <p className="text-xs text-muted-foreground">
                          {tmpl.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tmpl.triageLabelId
                          ? `Label: ${
                              triageLabels.find((l) => l._id === tmpl.triageLabelId)
                                ?.label ?? "—"
                            }`
                          : "Regular task"}
                        {tmpl.attachmentFileName
                          ? ` · Attachment: ${tmpl.attachmentFileName}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEditTemplate(tmpl)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void removeTemplate(tmpl)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
                {templates.length === 0 ? (
                  <li className="rounded-dlc-sm border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                    No templates in this group yet.
                  </li>
                ) : null}
              </ul>

              <div className="space-y-3 rounded-dlc-md border border-border/60 bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {editingTemplateId ? "Edit template" : "New task template"}
                </p>
                <Input
                  placeholder="Task title"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.currentTarget.value)}
                  className="min-h-10"
                  data-testid="template-task-title"
                />
                <Input
                  placeholder="Description (optional)"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.currentTarget.value)}
                  className="min-h-10"
                />
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Triage label
                  </span>
                  <Select
                    className="min-h-10"
                    value={templateLabelId}
                    onChange={(e) => setTemplateLabelId(e.currentTarget.value)}
                  >
                    {labelOptions.map((opt) => (
                      <option key={opt.id || "none"} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-dlc-sm border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:border-primary/40">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    {attachmentMeta?.fileName ?? "Attach template file"}
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => void onPickAttachment(e)}
                      disabled={busy}
                    />
                  </label>
                  {attachmentMeta ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setAttachmentMeta(null)}
                    >
                      Remove file
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-10"
                    disabled={busy || !templateTitle.trim()}
                    onClick={() => void saveTemplate()}
                    data-testid="template-task-save"
                  >
                    {editingTemplateId ? "Update template" : "Add template"}
                  </Button>
                  {editingTemplateId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetTemplateForm}
                    >
                      Cancel edit
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Create a playbook group to start adding task templates.
            </p>
          )}
        </section>
      </div>

      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
