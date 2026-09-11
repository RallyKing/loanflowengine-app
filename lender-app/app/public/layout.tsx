import { PublicPortalProviders } from "@/components/portal/PublicPortalProviders";

export default function PublicAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicPortalProviders>{children}</PublicPortalProviders>;
}
