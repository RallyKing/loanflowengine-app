import type { Metadata } from "next";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";
import { TaskTemplateManagerPage } from "@/components/library/TaskTemplateManagerPage";

export const metadata: Metadata = {
  title: "Document vault templates · Settings",
  description:
    "Manage document vault task template stacks and baseline file tasks.",
};

export default function DocumentVaultTemplatesSettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb
        parentSection="organization"
        current="Document vault templates"
      />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        Document vault templates
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create template stacks and individual baseline tasks for your document
        vault. Brokers apply these from the pipeline file workspace.
      </p>
      <TaskTemplateManagerPage />
    </div>
  );
}
