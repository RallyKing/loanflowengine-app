import type { Metadata } from "next";
import { PublicPortalProviders } from "@/components/portal/PublicPortalProviders";

export const metadata: Metadata = {
  title: "Client document portal",
  robots: { index: false, follow: false },
};

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicPortalProviders>
      <div className="min-h-dvh bg-neutral-50" data-shell="client-portal-bundle">
        {children}
      </div>
    </PublicPortalProviders>
  );
}
