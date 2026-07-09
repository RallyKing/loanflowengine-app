import { requireUser } from "@/lib/requireUser";
import { PipelineTriageClockShell } from "./PipelineTriageClockShell";

export default async function PipelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return <PipelineTriageClockShell>{children}</PipelineTriageClockShell>;
}
