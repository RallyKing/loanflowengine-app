import type { Metadata } from "next";

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
    <div className="min-h-dvh bg-white" data-shell="upload-portal">
      {children}
    </div>
  );
}
