import type { Metadata } from "next";
import { PublicPortalProviders } from "@/components/portal/PublicPortalProviders";

export const metadata: Metadata = {
  title: "Secure document upload",
  robots: { index: false, follow: false },
};

export default function FileTaskUploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicPortalProviders>
      <div className="min-h-dvh bg-white" data-shell="upload-portal">
        {children}
      </div>
    </PublicPortalProviders>
  );
}
