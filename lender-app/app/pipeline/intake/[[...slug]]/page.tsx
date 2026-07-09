import { LegacyIntakeRedirectClient } from "./LegacyIntakeRedirectClient";

export const dynamic = "force-dynamic";

export default async function LegacyIntakePathsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  return <LegacyIntakeRedirectClient slug={slug ?? []} />;
}
