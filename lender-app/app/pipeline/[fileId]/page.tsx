import { PipelineFilePageClient } from "./PipelineFilePageClient";

export default async function PipelineFilePage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  return <PipelineFilePageClient fileId={fileId} />;
}
