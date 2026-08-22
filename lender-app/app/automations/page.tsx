import type { Metadata } from "next";
import { Suspense } from "react";
import { AutomationsWorkspaceClient } from "./AutomationsWorkspaceClient";

export const metadata: Metadata = {
  title: "Automations",
  description:
    "Email and SMS templates plus automation templates for updates, notifications, scheduled follow-ups, and reminders.",
};

export default function AutomationsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          Loading Automations…
        </div>
      }
    >
      <AutomationsWorkspaceClient />
    </Suspense>
  );
}
