import { redirect } from "next/navigation";

/** Legacy `/pipeline/file/.../deal` URLs open the file on the pipeline board. */
export default async function LegacyDealEditorRedirect({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  redirect(`/pipeline/${encodeURIComponent(fileId)}`);
}
