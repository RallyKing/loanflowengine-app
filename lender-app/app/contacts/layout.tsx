import { requireUser } from "@/lib/requireUser";

export default async function ContactsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
