import type { Metadata } from "next";
import { LoanTemplatesManager } from "@/components/settings/LoanTemplatesManager";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";

export const metadata: Metadata = {
  title: "Loan templates · Settings",
  description:
    "Manage loan strategy templates: drawer blocks, favorites, portal document checklists, and task playbooks.",
};

export default function LoanTemplatesSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb
        parentSection="workflow"
        current="Loan strategy templates"
      />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        Loan strategy templates
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Templates drive the New File wizard: which blocks the file shows, the
        default favorites bar, the borrower portal document checklist, and the
        task playbooks applied on creation.
      </p>
      <LoanTemplatesManager />
    </div>
  );
}
