import { requireUser } from "@/lib/requireUser";

export default async function LendersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
