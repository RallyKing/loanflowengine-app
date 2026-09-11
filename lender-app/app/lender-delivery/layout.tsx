import type { Metadata } from "next";
import { PublicPortalProviders } from "@/components/portal/PublicPortalProviders";

export const metadata: Metadata = {
  title: "Secure lender delivery",
  robots: { index: false, follow: false },
};

export default function LenderDeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicPortalProviders>
      <div className="min-h-dvh bg-neutral-50" data-shell="lender-delivery-portal">
        {children}
      </div>
    </PublicPortalProviders>
  );
}
