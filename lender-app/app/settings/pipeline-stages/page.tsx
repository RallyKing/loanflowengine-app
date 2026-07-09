import type { Metadata } from "next";
import { PipelineStagesManager } from "@/components/settings/PipelineStagesManager";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";

export const metadata: Metadata = {
  title: "Pipeline stages · Settings",
  description:
    "Configure organization pipeline funnel stages, sub-stages, colors, and order.",
};

export default function PipelineStagesSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb
        parentSection="pipelineAdmin"
        current="Pipeline stages"
      />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        Pipeline stages
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customize your funnel. Parent stages define the main workflow; sub-stages
        add detail inside each step.
      </p>
      <PipelineStagesManager />
    </div>
  );
}
