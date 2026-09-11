import type { Metadata } from "next";
import { SettingsBreadcrumb } from "@/components/settings/SettingsBreadcrumb";
import { PortalDefaultsPageBuilder } from "@/components/settings/PortalDefaultsPageBuilder";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata: Metadata = {
  title: "Portal page builder · Settings",
  description:
    "Compose portal pages from premade sections, manage versions, and publish as a default.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PortalDefaultsBuilderPage({ params }: PageProps) {
  const resolved = await params;
  const id = resolved.id as Id<"portalDefaults">;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 max-md:px-4">
      <SettingsBreadcrumb
        parentSection="organization"
        current="Portal page builder"
      />
      <PortalDefaultsPageBuilder portalDefaultId={id} />
    </div>
  );
}
