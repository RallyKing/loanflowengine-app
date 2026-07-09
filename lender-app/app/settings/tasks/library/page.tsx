import type { Metadata } from "next";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";
import { TaskTemplateLibraryManager } from "@/components/settings/TaskTemplateLibraryManager";

export const metadata: Metadata = {
  title: "Task library · Settings",
  description:
    "Build playbook groups and task templates with attachments for pipeline files.",
};

export default function TaskLibrarySettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb parentSection="organization" current="Task library" />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        Task library
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Define playbook groups (loan programs, lenders, workflows) and the tasks
        — with optional triage labels and file attachments — brokers apply in one
        click from a pipeline file.
      </p>
      <TaskTemplateLibraryManager />
    </div>
  );
}
