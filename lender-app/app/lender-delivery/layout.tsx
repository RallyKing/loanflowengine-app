import type { Metadata } from "next";

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
    <div className="min-h-dvh bg-neutral-50" data-shell="lender-delivery-portal">
      {children}
    </div>
  );
}
