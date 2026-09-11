import type { Metadata } from "next";
import { AiProvidersSettingsManager } from "@/components/settings/AiProvidersSettingsManager";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";

export const metadata: Metadata = {
  title: "AI API keys · Settings",
  description:
    "Connect your own OpenAI, Anthropic, Gemini, or custom AI provider and manage due diligence prompts.",
};

export default function AiProvidersSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb parentSection="aiProviders" current="AI API keys" />
      <h1 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
        AI API keys
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Link your own AI provider for Due Diligence and future org AI features.
        Keys are org-scoped; after save only the last four characters are shown.
      </p>
      <AiProvidersSettingsManager />
    </div>
  );
}
