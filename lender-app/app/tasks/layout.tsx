import { requireUser } from "@/lib/requireUser";

export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}
