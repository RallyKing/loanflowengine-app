import { requireUser } from "@/lib/requireUser";

export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
